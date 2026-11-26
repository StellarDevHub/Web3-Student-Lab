import { describe, expect, it } from 'vitest';
import {
  completeAuthenticatedKeyAgreement,
  createLocalStellarEd25519Signer,
  createSignedEphemeralKeySession,
  decryptDataChannelPayload,
  decryptMediaFrame,
  encryptDataChannelPayload,
  encryptMediaFrame,
  PeerIdentityMismatchError,
  verifySignedEphemeralKeyBundle,
} from '../p2p-crypto';

describe('WebRTC Ed25519-Authenticated ECDH Key Agreement (FE-074)', () => {
  it('completes mutual Ed25519-authenticated key agreement and derives matching E2EE keys', async () => {
    const mentorSigner = createLocalStellarEd25519Signer();
    const studentSigner = createLocalStellarEd25519Signer();
    const roomId = 'mentor-student-room-42';

    const mentorSession = await createSignedEphemeralKeySession(roomId, mentorSigner);
    const studentSession = await createSignedEphemeralKeySession(roomId, studentSigner);

    const mentorAgreement = await completeAuthenticatedKeyAgreement(
      mentorSession,
      studentSession.localBundle,
      studentSigner.publicKey
    );
    const studentAgreement = await completeAuthenticatedKeyAgreement(
      studentSession,
      mentorSession.localBundle,
      mentorSigner.publicKey
    );

    expect(mentorAgreement.sessionId).toBe(studentAgreement.sessionId);
    expect(mentorAgreement.editorSyncSecret).toBe(studentAgreement.editorSyncSecret);
    expect(mentorAgreement.peerStellarPublicKey).toBe(studentSigner.publicKey);
    expect(studentAgreement.peerStellarPublicKey).toBe(mentorSigner.publicKey);

    // Verify data channel E2EE interoperability
    const encryptedData = await encryptDataChannelPayload(
      mentorAgreement.dataChannelKey,
      'const soroban = "verified";'
    );
    const decryptedBytes = await decryptDataChannelPayload(
      studentAgreement.dataChannelKey,
      encryptedData
    );
    expect(new TextDecoder().decode(decryptedBytes)).toBe('const soroban = "verified";');

    // Verify audio/video media frame E2EE interoperability
    const rawFrame = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).buffer;
    const encryptedFrame = await encryptMediaFrame(mentorAgreement.mediaFrameKey, rawFrame);
    expect(new Uint8Array(encryptedFrame)).not.toEqual(new Uint8Array(rawFrame));

    const decryptedFrame = await decryptMediaFrame(studentAgreement.mediaFrameKey, encryptedFrame);
    expect(new Uint8Array(decryptedFrame)).toEqual(new Uint8Array(rawFrame));
  });

  it('rejects a peer bundle with a tampered Ed25519 signature', async () => {
    const mentorSigner = createLocalStellarEd25519Signer();
    const studentSigner = createLocalStellarEd25519Signer();
    const roomId = 'room-tampered-sig';

    const mentorSession = await createSignedEphemeralKeySession(roomId, mentorSigner);
    const studentSession = await createSignedEphemeralKeySession(roomId, studentSigner);

    const forgedBundle = {
      ...studentSession.localBundle,
      signature: studentSession.localBundle.signature.slice(0, -4) + 'AAAA',
    };

    const result = await verifySignedEphemeralKeyBundle(forgedBundle, {
      expectedRoomId: roomId,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('INVALID_SIGNATURE');
    }

    await expect(
      completeAuthenticatedKeyAgreement(mentorSession, forgedBundle)
    ).rejects.toMatchObject({
      name: 'PeerIdentityMismatchError',
      code: 'INVALID_SIGNATURE',
    });
  });

  it('rejects a MitM attacker with an identity mismatch warning when peer key is pinned', async () => {
    const mentorSigner = createLocalStellarEd25519Signer();
    const expectedStudentSigner = createLocalStellarEd25519Signer();
    const attackerSigner = createLocalStellarEd25519Signer();
    const roomId = 'room-pinned-identity';

    const mentorSession = await createSignedEphemeralKeySession(roomId, mentorSigner);
    const attackerSession = await createSignedEphemeralKeySession(roomId, attackerSigner);

    await expect(
      completeAuthenticatedKeyAgreement(
        mentorSession,
        attackerSession.localBundle,
        expectedStudentSigner.publicKey
      )
    ).rejects.toThrow(PeerIdentityMismatchError);

    await expect(
      completeAuthenticatedKeyAgreement(
        mentorSession,
        attackerSession.localBundle,
        expectedStudentSigner.publicKey
      )
    ).rejects.toMatchObject({
      code: 'IDENTITY_MISMATCH',
    });
  });

  it('rejects a peer bundle issued for a different room or expired', async () => {
    const mentorSigner = createLocalStellarEd25519Signer();
    const studentSigner = createLocalStellarEd25519Signer();

    const mentorSession = await createSignedEphemeralKeySession('room-a', mentorSigner);
    const wrongRoomSession = await createSignedEphemeralKeySession('room-b', studentSigner);

    await expect(
      completeAuthenticatedKeyAgreement(mentorSession, wrongRoomSession.localBundle)
    ).rejects.toMatchObject({
      code: 'ROOM_MISMATCH',
    });

    const expiredSession = await createSignedEphemeralKeySession('room-a', studentSigner, -1000);
    await expect(
      completeAuthenticatedKeyAgreement(mentorSession, expiredSession.localBundle)
    ).rejects.toMatchObject({
      code: 'EXPIRED_BUNDLE',
    });
  });

  it('rejects a bundle with an invalid Stellar public key or tampered ephemeral key', async () => {
    const studentSigner = createLocalStellarEd25519Signer();
    const session = await createSignedEphemeralKeySession('room-x', studentSigner);

    const invalidKeyResult = await verifySignedEphemeralKeyBundle(
      { ...session.localBundle, stellarPublicKey: 'NOT_A_STELLAR_KEY' },
      { expectedRoomId: 'room-x' }
    );
    expect(invalidKeyResult.valid).toBe(false);
    if (!invalidKeyResult.valid) {
      expect(invalidKeyResult.code).toBe('INVALID_PUBLIC_KEY');
    }

    const tamperedKeyIdResult = await verifySignedEphemeralKeyBundle(
      { ...session.localBundle, ephemeralKeyId: 'tampered-fingerprint' },
      { expectedRoomId: 'room-x' }
    );
    expect(tamperedKeyIdResult.valid).toBe(false);
    if (!tamperedKeyIdResult.valid) {
      expect(tamperedKeyIdResult.code).toBe('KEY_ID_MISMATCH');
    }
  });
});
