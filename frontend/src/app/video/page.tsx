'use client';

import { useState, useEffect, useRef } from 'react';

export default function VideoPlayerPage() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Simulate video loading
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
      setDuration(360); // 6 minutes in seconds
    }, 800);

    return () => clearTimeout(timer);
  }, []);

  // Handle play/pause
  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch(e => console.error('Error playing video:', e));
      }
      setIsPlaying(!isPlaying);
    }
  };

  // Handle volume
  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  // Handle progress bar
  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newProgress = parseInt(e.target.value);
    setProgress(newProgress);
    if (videoRef.current) {
      videoRef.current.currentTime = (newProgress / 100) * duration;
    }
  };

  // Handle fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement) {
      if (videoRef.current?.parentElement) {
        if (videoRef.current.parentElement.requestFullscreen) {
          videoRef.current.parentElement.requestFullscreen();
        } else if (videoRef.current.parentElement.webkitRequestFullscreen) {
          videoRef.current.parentElement.webkitRequestFullscreen();
        } else if (videoRef.current.parentElement.msRequestFullscreen) {
          videoRef.current.parentElement.msRequestFullscreen();
        }
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
      setIsFullscreen(false);
    }
  };

  // Handle time update
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateTime = () => {
      if (video.duration) {
        setDuration(video.duration);
        setProgress((video.currentTime / video.duration) * 100);
      }
    };

    const updateProgress = () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      progressIntervalRef.current = setInterval(() => {
        if (videoRef.current && isPlaying) {
          setProgress((videoRef.current.currentTime / videoRef.current.duration) * 100);
        }
      }, 1000);
    };

    video.addEventListener('timeupdate', updateTime);
    video.addEventListener('loadedmetadata', updateTime);

    if (isPlaying) {
      updateProgress();
    }

    return () => {
      video.removeEventListener('timeupdate', updateTime);
      video.removeEventListener('loadedmetadata', updateTime);
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [isPlaying]);

  // Handle fullscreen change
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement || !!document.webkitFullscreenElement || !!document.msFullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('msfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Format time helper
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Video Container */}
      <div className="relative w-full max-w-7xl mx-auto px-4 py-8">
        <div className="relative rounded-xl overflow-hidden bg-gray-900">
          {/* Video Player */}
          <div className="relative aspect-video bg-gradient-to-br from-gray-900 to-black">
            {isLoading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-4 border-red-600/30 border-t-red-600"></div>
                  <p className="font-mono text-sm tracking-widest text-red-500 uppercase">Loading video...</p>
                </div>
              </div>
            ) : (
              <>
                {/* Video element - using placeholder since we don't have actual video */}
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-900 to-black">
                  <div className="text-center p-8">
                    <div className="mx-auto mb-4 h-24 w-24 rounded-full bg-gradient-to-r from-red-500 to-purple-600 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <h2 className="text-2xl font-bold mb-2">Web3 Student Lab Course Video</h2>
                    <p className="text-gray-400 mb-4">Blockchain Fundamentals - Module 1</p>
                    <p className="text-gray-500 text-sm">This is a placeholder for the video player. In production, this would be an actual video element with HLS streaming.</p>
                  </div>
                </div>

                {/* Video Controls Overlay */}
                <div className="absolute inset-0 flex flex-col justify-end">
                  {/* Progress Bar */}
                  <div className="px-4 pb-2">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={progress}
                      onChange={handleProgressChange}
                      className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                      aria-label="Video progress"
                    />
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      <span>{formatTime((progress / 100) * duration)}</span>
                      <span>{formatTime(duration)}</span>
                    </div>
                  </div>

                  {/* Main Controls */}
                  <div className="px-4 pb-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <button
                        onClick={togglePlay}
                        className="flex items-center justify-center w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                        aria-label={isPlaying ? "Pause video" : "Play video"}
                      >
                        {isPlaying ? (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        )}
                      </button>

                      <button
                        onClick={toggleMute}
                        className="flex items-center justify-center w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                        aria-label={isMuted ? "Unmute video" : "Mute video"}
                      >
                        {isMuted ? (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.586 15.31c-.193-.31-.31-.64-.31-.988 0-.348.117-.678.31-.988l.22-.37a1.21 1.21 0 01.38-.38l.37-.22a1.21 1.21 0 01.988-.31c.348 0 .678.117.988.31l.37.22a1.21 1.21 0 01.38.38l.22.37a1.21 1.21 0 01.31.988c0 .348-.117.678-.31.988l-.22.37a1.21 1.21 0 01-.38.38l-.37.22a1.21 1.21 0 01-.988.31c-.348 0-.678-.117-.988-.31l-.37-.22a1.21 1.21 0 01-.38-.38l-.22-.37zM2.31 15.31a1.21 1.21 0 01-.31-.988c0-.348.117-.678.31-.988l.22-.37a1.21 1.21 0 01.38-.38l.37-.22a1.21 1.21 0 01.988-.31c.348 0 .678.117.988.31l.37.22a1.21 1.21 0 01.38.38l.22.37a1.21 1.21 0 01.31.988c0 .348-.117.678-.31.988l-.22.37a1.21 1.21 0 01-.38.38l-.37.22a1.21 1.21 0 01-.988.31c-.348 0-.678-.117-.988-.31l-.37-.22a1.21 1.21 0 01-.38-.38l-.22-.37z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15.31a1.21 1.21 0 01-.31-.988c0-.348.117-.678.31-.988l.22-.37a1.21 1.21 0 01.38-.38l.37-.22a1.21 1.21 0 01.988-.31c.348 0 .678.117.988.31l.37.22a1.21 1.21 0 01.38.38l.22.37a1.21 1.21 0 01.31.988c0 .348-.117.678-.31.988l-.22.37a1.21 1.21 0 01-.38.38l-.37.22a1.21 1.21 0 01-.988.31c-.348 0-.678-.117-.988-.31l-.37-.22a1.21 1.21 0 01-.38-.38l-.22-.37z" />
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072M16 10a3 3 0 01-3 3H5a3 3 0 01-3-3V6a3 3 0 013-3h8a3 3 0 013 3v4z" />
                          </svg>
                        )}
                      </button>

                      <div className="flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072M16 10a3 3 0 01-3 3H5a3 3 0 01-3-3V6a3 3 0 013-3h8a3 3 0 013 3v4z" />
                        </svg>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.1"
                          value={volume}
                          onChange={(e) => setVolume(parseFloat(e.target.value))}
                          className="w-20 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                          aria-label="Volume control"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => {
                          if (videoRef.current) {
                            videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 15);
                          }
                        }}
                        className="flex items-center justify-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                        aria-label="Rewind 15 seconds"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
                        </svg>
                      </button>

                      <button
                        onClick={() => {
                          if (videoRef.current) {
                            videoRef.current.currentTime = Math.min(videoRef.current.duration, videoRef.current.currentTime + 15);
                          }
                        }}
                        className="flex items-center justify-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                        aria-label="Forward 15 seconds"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.932 12.8a1 1 0 000-1.6L6.598 7.2A1 1 0 005 8v8a1 1 0 001.598.8l5.334-4zM19.932 12.8a1 1 0 000-1.6l-5.334-4A1 1 0 0013 8v8a1 1 0 001.598.8l5.334-4z" />
                        </svg>
                      </button>

                      <button
                        onClick={toggleFullscreen}
                        className="flex items-center justify-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                        aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                      >
                        {isFullscreen ? (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5M4 16v4m0 0h4m0 4l5-5m12 0v-4m0 0h-4m0 0l-5 5m12-5v4m0 0h-4m0 4l-5-5" />
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5M4 16v4m0 0h4m0 4l5-5m12 0v-4m0 0h-4m0 0l-5 5m12-5v4m0 0h-4m0 4l-5-5" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Video Info */}
          <div className="p-6">
            <div className="mb-4">
              <h1 className="text-3xl font-bold mb-2">Blockchain Fundamentals - Module 1</h1>
              <p className="text-gray-400 mb-4">Understanding the core concepts of blockchain technology, distributed ledgers, and consensus mechanisms.</p>

              <div className="flex items-center gap-6 text-sm text-gray-400">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-green-500"></span>
                  <span>Completed</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-blue-500"></span>
                  <span>12 minutes remaining</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-yellow-500"></span>
                  <span>Next: Smart Contract Development</span>
                </div>
              </div>
            </div>

            {/* Video Description */}
            <div className="border-t border-gray-800 pt-6">
              <h2 className="text-xl font-semibold mb-4">About this lesson</h2>
              <div className="space-y-3 text-gray-300">
                <p>This comprehensive introduction covers:</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>What is a blockchain and how it differs from traditional databases</li>
                  <li>The role of miners, validators, and nodes in network security</li>
                  <li>Consensus algorithms: Proof of Work vs Proof of Stake</li>
                  <li>Transaction lifecycle from creation to finality</li>
                  <li>Smart contracts as self-executing agreements</li>
                </ul>
                <p className="mt-4 text-sm text-gray-400">
                  This lesson is part of the Web3 Student Lab curriculum designed to prepare students for Soroban smart contract development on the Stellar blockchain.
                </p>
              </div>
            </div>

            {/* Related Videos */}
            <div className="border-t border-gray-800 pt-6">
              <h2 className="text-xl font-semibold mb-4">Related lessons</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-800/50 rounded-lg p-4 hover:bg-gray-800/70 transition-colors cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-md bg-gradient-to-r from-blue-500 to-cyan-500 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-medium">Soroban Smart Contracts</h3>
                      <p className="text-xs text-gray-400">Module 2 • 18 min</p>
                    </div>
                  </div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4 hover:bg-gray-800/70 transition-colors cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-md bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-medium">Stellar Network Architecture</h3>
                      <p className="text-xs text-gray-400">Module 3 • 15 min</p>
                    </div>
                  </div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4 hover:bg-gray-800/70 transition-colors cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-md bg-gradient-to-r from-purple-500 to-fuchsia-500 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-medium">Web3 Development Tools</h3>
                      <p className="text-xs text-gray-400">Module 4 • 22 min</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="mt-8 flex justify-between items-center">
          <button className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
            <span>Previous lesson</span>
          </button>
          <button className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
            <span>Next lesson</span>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
