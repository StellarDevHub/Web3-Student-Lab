module.exports = {
  extends: ['@commitlint/config-conventional'],
  ignores: [
    (commit) =>
      commit.startsWith('Merge ') ||
      commit.startsWith('Fix/') ||
      commit.startsWith('feat/') ||
      commit.startsWith('chore/'),
  ],
};
