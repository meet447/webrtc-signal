// Type definitions for VoiceSignal WebRTC SDK
// Project: VoiceSignal
// Definitions by: Your Name

export interface VoiceSignalOptions {
  /**
   * WebSocket URL of the signaling server
   */
  serverUrl: string;
  
  /**
   * Unique identifier for the room/session
   */
  roomId: string;
  
  /**
   * Unique identifier for the current user
   */
  userId: string;
  
  /**
   * Enable video (default: true)
   */
  video?: boolean;
  
  /**
   * Enable audio (default: true)
   */
  audio?: boolean;
  
  /**
   * ICE servers for NAT traversal (defaults to STUN only)
   */
  iceServers?: RTCIceServer[];
  
  /**
   * TURN server credentials { urls, username, credential }
   */
  turnCredentials?: RTCIceServer;
  
  /**
   * Specific audio device ID to use
   */
  audioDeviceId?: string;
  
  /**
   * Specific video device ID to use
   */
  videoDeviceId?: string;
}

export interface Devices {
  /**
   * Available audio input devices
   */
  audioInputs: MediaDeviceInfo[];
  
  /**
   * Available audio output devices
   */
  audioOutputs: MediaDeviceInfo[];
  
  /**
   * Available video input devices
   */
  videoInputs: MediaDeviceInfo[];
}

export class VoiceSignal {
  /**
   * Create a new VoiceSignal instance
   */
  constructor(options: VoiceSignalOptions);
  
  /**
   * Register an event handler
   */
  on(event: string, callback: (...args: any[]) => void): void;
  
  /**
   * Emit an event
   */
  emit(event: string, ...args: any[]): void;
  
  /**
   * Enumerate available media devices
   */
  enumerateDevices(): Promise<Devices>;
  
  /**
   * Join a room and establish connections with other participants
   */
  join(): Promise<void>;
  
  /**
   * Get local media stream (audio/video)
   */
  getLocalStream(): Promise<MediaStream | null>;
  
  /**
   * Switch to a different audio device
   */
  switchAudioDevice(deviceId: string): Promise<void>;
  
  /**
   * Switch to a different video device
   */
  switchVideoDevice(deviceId: string): Promise<void>;
  
  /**
   * Create an offer for a new peer connection
   */
  createOffer(peerId: string): Promise<void>;
  
  /**
   * Handle an offer from another peer
   */
  handleOffer(peerId: string, offer: RTCSessionDescriptionInit): Promise<void>;
  
  /**
   * Handle an answer from another peer
   */
  handleAnswer(peerId: string, answer: RTCSessionDescriptionInit): Promise<void>;
  
  /**
   * Create a new RTCPeerConnection
   */
  createPeer(peerId: string): Promise<RTCPeerConnection>;
  
  /**
   * Handle when a user leaves the room
   */
  handleUserLeft(userId: string): void;
  
  /**
   * Toggle microphone mute state
   */
  muteMic(mute: boolean): void;
  
  /**
   * Toggle camera on/off
   */
  toggleCamera(off: boolean): void;
  
  /**
   * Check if connected to the signaling server
   */
  isConnected(): boolean;
  
  /**
   * Get list of connected peers
   */
  getPeers(): string[];
  
  /**
   * Get ICE connection states for all peers
   */
  getIceConnectionStates(): Record<string, RTCIceConnectionState>;
  
  /**
   * Leave the room and close all connections
   */
  leave(): void;
}

export interface VoiceSignalEventMap {
  'joined': () => void;
  'userJoined': (userId: string) => void;
  'userLeft': (userId: string) => void;
  'localStream': (stream: MediaStream) => void;
  'stream': (stream: MediaStream, userId: string) => void;
  'micMuted': (muted: boolean) => void;
  'cameraToggled': (off: boolean) => void;
  'connectionStateChange': (state: RTCPeerConnectionState, userId: string) => void;
  'iceConnectionStateChange': (state: RTCIceConnectionState, userId: string) => void;
  'devicesEnumerated': (devices: Devices) => void;
  'audioDeviceChanged': (deviceId: string) => void;
  'videoDeviceChanged': (deviceId: string) => void;
  'disconnected': () => void;
  'left': () => void;
  'error': (error: Error) => void;
}