// index.js
export class VoiceSignal {
  constructor({ serverUrl, roomId, userId }) {
    this.serverUrl = serverUrl;
    this.roomId = roomId;
    this.userId = userId;

    this.ws = null;
    this.peers = {};
    this.localStream = null;
    this.eventHandlers = {};
  }

  on(event, callback) {
    this.eventHandlers[event] = callback;
  }

  emit(event, ...args) {
    if (this.eventHandlers[event]) this.eventHandlers[event](...args);
  }

  async join() {
    this.ws = new WebSocket(this.serverUrl);
    this.ws.onopen = () => {
      console.log("✅ Connected to signaling server");
      this.ws.send(
        JSON.stringify({
          type: "join",
          roomId: this.roomId,
          userId: this.userId,
        })
      );
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
            await this.peers[data.from].addIceCandidate(data.payload);
          }
          break;

        case "user-left":
          this.handleUserLeft(data.userId);
          break;
      }
    };
  }

  async getLocalStream() {
    if (!this.localStream) {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.emit("localStream", this.localStream);
    }
    return this.localStream;
  }

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

  async handleAnswer(peerId, answer) {
    const peer = this.peers[peerId];
    if (!peer) return;
    await peer.setRemoteDescription(new RTCSessionDescription(answer));
  }

  async createPeer(peerId) {
    const peer = new RTCPeerConnection({
      iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
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

    const stream = await this.getLocalStream();
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));

    this.peers[peerId] = peer;
    return peer;
  }

  handleUserLeft(userId) {
    if (this.peers[userId]) {
      this.peers[userId].close();
      delete this.peers[userId];
      this.emit("userLeft", userId);
    }
  }

  muteMic(mute) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => (track.enabled = !mute));
    }
  }

  leave() {
    Object.values(this.peers).forEach((peer) => peer.close());
    if (this.ws) this.ws.close();
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
    }
    this.emit("left");
  }
}