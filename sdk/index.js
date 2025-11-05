// VoiceSignal WebRTC SDK
//
// Easy-to-use WebRTC SDK for adding voice and video calling to your applications.
//
// Basic Usage:
// import { VoiceSignal } from './sdk/index.js';
// 
// const voiceCall = new VoiceSignal({
//   serverUrl: 'wss://your-signaling-server.com',
//   roomId: 'room-123',
//   userId: 'user-456'
// });
// 
// voiceCall.on('localStream', (stream) => {
//   // Display local video/audio stream
//   document.getElementById('localVideo').srcObject = stream;
// });
// 
// voiceCall.on('stream', (stream, userId) => {
//   // Display remote user's video/audio stream
//   document.getElementById('remoteVideo-' + userId).srcObject = stream;
// });
// 
// await voiceCall.join();

export class VoiceSignal {
  /**
   * Create a new VoiceSignal instance
   * @param {Object} options - Configuration options
   * @param {string} options.serverUrl - WebSocket URL of the signaling server
   * @param {string} options.roomId - Unique identifier for the room/session
   * @param {string} options.userId - Unique identifier for the current user
   * @param {boolean} [options.video=true] - Enable video (default: true)
   * @param {boolean} [options.audio=true] - Enable audio (default: true)
   * @param {Array} [options.iceServers=null] - ICE servers for NAT traversal (defaults to STUN only)
   * @param {Object} [options.turnCredentials=null] - TURN server credentials { urls, username, credential }
   * @param {string} [options.audioDeviceId=null] - Specific audio device ID to use
   * @param {string} [options.videoDeviceId=null] - Specific video device ID to use
   */
  constructor({ 
    serverUrl, 
    roomId, 
    userId, 
    video = true, 
    audio = true, 
    iceServers = null, 
    turnCredentials = null,
    audioDeviceId = null,
    videoDeviceId = null
  }) {
    this.serverUrl = serverUrl;
    this.roomId = roomId;
    this.userId = userId;
    this.video = video;
    this.audio = audio;
    this.audioDeviceId = audioDeviceId;
    this.videoDeviceId = videoDeviceId;
    
    // Configure ICE servers with TURN support
    if (iceServers) {
      this.iceServers = iceServers;
    } else if (turnCredentials) {
      // Use provided TURN credentials
      this.iceServers = [
        { urls: ["stun:stun.l.google.com:19302"] },
        { urls: ["stun:stun1.l.google.com:19302"] },
        turnCredentials
      ];
    } else {
      // Default ICE servers (STUN only)
      this.iceServers = [
        { urls: ["stun:stun.l.google.com:19302"] },
        { urls: ["stun:stun1.l.google.com:19302"] }
      ];
    }

    this.ws = null;
    this.peers = {};
    this.localStream = null;
    this.eventHandlers = {};
    this.isJoined = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.devices = {
      audioInputs: [],
      audioOutputs: [],
      videoInputs: []
    };
  }

  /**
   * Register an event handler
   * @param {string} event - Event name
   * @param {Function} callback - Event handler function
   */
  on(event, callback) {
    this.eventHandlers[event] = callback;
  }

  /**
   * Emit an event
   * @param {string} event - Event name
   * @param {...any} args - Arguments to pass to the event handler
   */
  emit(event, ...args) {
    if (this.eventHandlers[event]) this.eventHandlers[event](...args);
  }

  /**
   * Enumerate available media devices
   * @returns {Promise<Object>} Available devices categorized by type
   */
  async enumerateDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      this.devices.audioInputs = devices.filter(device => device.kind === 'audioinput');
      this.devices.audioOutputs = devices.filter(device => device.kind === 'audiooutput');
      this.devices.videoInputs = devices.filter(device => device.kind === 'videoinput');
      
      this.emit("devicesEnumerated", this.devices);
      return this.devices;
    } catch (error) {
      console.error("Error enumerating devices:", error);
      this.emit("error", new Error("Could not enumerate media devices"));
      return this.devices;
    }
  }

  /**
   * Join a room and establish connections with other participants
   */
  async join() {
    if (this.isJoined) {
      console.warn("Already joined the room");
      return;
    }

    try {
      this.ws = new WebSocket(this.serverUrl);
      
      this.ws.onopen = () => {
        console.log("✅ Connected to signaling server");
        this.reconnectAttempts = 0;
        this.ws.send(
          JSON.stringify({
            type: "join",
            roomId: this.roomId,
            userId: this.userId,
          })
        );
        this.isJoined = true;
        this.emit("joined");
      };

      this.ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        console.log("📩 Message:", data);

        switch (data.type) {
          case "existing-users":
            for (const id of data.users) {
              await this.createOffer(id);
            }
            break;

          case "user-joined":
            await this.createOffer(data.userId);
            this.emit("userJoined", data.userId);
            break;

          case "offer":
            await this.handleOffer(data.from, data.payload);
            break;

          case "answer":
            await this.handleAnswer(data.from, data.payload);
            break;

          case "ice":
            if (this.peers[data.from]) {
              try {
                await this.peers[data.from].addIceCandidate(data.payload);
              } catch (err) {
                console.error("Error adding ICE candidate:", err);
              }
            }
            break;

          case "user-left":
            this.handleUserLeft(data.userId);
            break;
        }
      };

      this.ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        this.emit("error", error);
      };

      this.ws.onclose = () => {
        console.log("WebSocket connection closed");
        this.isJoined = false;
        this.emit("disconnected");
        
        // Attempt to reconnect if not intentionally left
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          setTimeout(() => this.join(), 2000 * this.reconnectAttempts);
        }
      };

    } catch (error) {
      console.error("Error joining room:", error);
      this.emit("error", error);
    }
  }

  /**
   * Get local media stream (audio/video)
   * @returns {Promise<MediaStream>} Local media stream
   */
  async getLocalStream() {
    if (!this.localStream) {
      try {
        // Build constraints with device selection
        const constraints = {};
        
        if (this.audio) {
          constraints.audio = this.audioDeviceId ? 
            { deviceId: { exact: this.audioDeviceId } } : 
            true;
        }
        
        if (this.video) {
          constraints.video = this.videoDeviceId ? 
            { deviceId: { exact: this.videoDeviceId } } : 
            true;
        }
        
        this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
        this.emit("localStream", this.localStream);
      } catch (error) {
        console.error("Error getting local stream:", error);
        this.emit("error", new Error("Could not access camera/microphone. Please check permissions."));
      }
    }
    return this.localStream;
  }

  /**
   * Switch to a different audio device
   * @param {string} deviceId - ID of the audio device to switch to
   * @returns {Promise<void>}
   */
  async switchAudioDevice(deviceId) {
    if (!this.localStream) return;
    
    try {
      // Stop existing audio tracks
      const audioTracks = this.localStream.getAudioTracks();
      audioTracks.forEach(track => track.stop());
      
      // Get new stream with selected device
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } },
        video: false
      });
      
      // Replace tracks in local stream
      const newAudioTracks = newStream.getAudioTracks();
      if (newAudioTracks.length > 0) {
        this.localStream.addTrack(newAudioTracks[0]);
      }
      
      // Update peer connections with new track
      for (const peer of Object.values(this.peers)) {
        const sender = peer.getSenders().find(s => s.track && s.track.kind === 'audio');
        if (sender) {
          await sender.replaceTrack(newAudioTracks[0]);
        }
      }
      
      this.audioDeviceId = deviceId;
      this.emit("audioDeviceChanged", deviceId);
    } catch (error) {
      console.error("Error switching audio device:", error);
      this.emit("error", new Error("Could not switch audio device"));
    }
  }

  /**
   * Switch to a different video device
   * @param {string} deviceId - ID of the video device to switch to
   * @returns {Promise<void>}
   */
  async switchVideoDevice(deviceId) {
    if (!this.localStream) return;
    
    try {
      // Stop existing video tracks
      const videoTracks = this.localStream.getVideoTracks();
      videoTracks.forEach(track => track.stop());
      
      // Get new stream with selected device
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { deviceId: { exact: deviceId } }
      });
      
      // Replace tracks in local stream
      const newVideoTracks = newStream.getVideoTracks();
      if (newVideoTracks.length > 0) {
        this.localStream.addTrack(newVideoTracks[0]);
      }
      
      // Update peer connections with new track
      for (const peer of Object.values(this.peers)) {
        const sender = peer.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
          await sender.replaceTrack(newVideoTracks[0]);
        }
      }
      
      this.videoDeviceId = deviceId;
      this.emit("videoDeviceChanged", deviceId);
    } catch (error) {
      console.error("Error switching video device:", error);
      this.emit("error", new Error("Could not switch video device"));
    }
  }

  /**
   * Create an offer for a new peer connection
   * @param {string} peerId - ID of the peer to connect to
   */
  async createOffer(peerId) {
    const peer = await this.createPeer(peerId);
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    this.ws.send(
      JSON.stringify({
        type: "offer",
        roomId: this.roomId,
        userId: this.userId,
        payload: offer,
      })
    );
  }

  /**
   * Handle an offer from another peer
   * @param {string} peerId - ID of the peer sending the offer
   * @param {RTCSessionDescriptionInit} offer - Offer SDP
   */
  async handleOffer(peerId, offer) {
    const peer = await this.createPeer(peerId);
    await peer.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    this.ws.send(
      JSON.stringify({
        type: "answer",
        roomId: this.roomId,
        userId: this.userId,
        payload: answer,
      })
    );
  }

  /**
   * Handle an answer from another peer
   * @param {string} peerId - ID of the peer sending the answer
   * @param {RTCSessionDescriptionInit} answer - Answer SDP
   */
  async handleAnswer(peerId, answer) {
    const peer = this.peers[peerId];
    if (!peer) return;
    await peer.setRemoteDescription(new RTCSessionDescription(answer));
  }

  /**
   * Create a new RTCPeerConnection
   * @param {string} peerId - ID of the peer to connect to
   * @returns {RTCPeerConnection} New peer connection
   */
  async createPeer(peerId) {
    const peer = new RTCPeerConnection({
      iceServers: this.iceServers,
    });

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        this.ws.send(
          JSON.stringify({
            type: "ice",
            roomId: this.roomId,
            userId: this.userId,
            payload: event.candidate,
          })
        );
      }
    };

    peer.ontrack = (event) => {
      this.emit("stream", event.streams[0], peerId);
    };

    peer.onconnectionstatechange = () => {
      this.emit("connectionStateChange", peer.connectionState, peerId);
      console.log(`Connection state for ${peerId}:`, peer.connectionState);
    };

    peer.oniceconnectionstatechange = () => {
      this.emit("iceConnectionStateChange", peer.iceConnectionState, peerId);
      console.log(`ICE connection state for ${peerId}:`, peer.iceConnectionState);
    };

    // Add local stream tracks to the peer connection
    const stream = await this.getLocalStream();
    if (stream) {
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    }

    this.peers[peerId] = peer;
    return peer;
  }

  /**
   * Handle when a user leaves the room
   * @param {string} userId - ID of the user who left
   */
  handleUserLeft(userId) {
    if (this.peers[userId]) {
      this.peers[userId].close();
      delete this.peers[userId];
      this.emit("userLeft", userId);
    }
  }

  /**
   * Toggle microphone mute state
   * @param {boolean} mute - True to mute, false to unmute
   */
  muteMic(mute) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => (track.enabled = !mute));
      this.emit("micMuted", mute);
    }
  }

  /**
   * Toggle camera on/off
   * @param {boolean} off - True to turn off, false to turn on
   */
  toggleCamera(off) {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((track) => (track.enabled = !off));
      this.emit("cameraToggled", off);
    }
  }

  /**
   * Check if connected to the signaling server
   * @returns {boolean} Connection status
   */
  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get list of connected peers
   * @returns {Array<string>} Array of peer IDs
   */
  getPeers() {
    return Object.keys(this.peers);
  }

  /**
   * Get ICE connection states for all peers
   * @returns {Object} Object mapping peer IDs to their ICE connection states
   */
  getIceConnectionStates() {
    const states = {};
    for (const [peerId, peer] of Object.entries(this.peers)) {
      states[peerId] = peer.iceConnectionState;
    }
    return states;
  }

  /**
   * Leave the room and close all connections
   */
  leave() {
    // Notify server about leaving
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: "leave",
        roomId: this.roomId,
        userId: this.userId
      }));
    }

    // Close all peer connections
    Object.values(this.peers).forEach((peer) => peer.close());
    
    // Close WebSocket connection
    if (this.ws) this.ws.close();
    
    // Stop local stream tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
    }
    
    this.isJoined = false;
    this.emit("left");
  }
}