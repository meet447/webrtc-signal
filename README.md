# VoiceSignal WebRTC SDK

An easy-to-use WebRTC SDK for adding voice and video calling to your web applications.

## Features

- **Voice and Video Calling**: Support for both audio and video streams
- **Device Selection**: Choose specific microphones and cameras
- **NAT Traversal**: STUN/TURN server support for better connectivity
- **Reconnection Logic**: Automatic reconnection attempts
- **Error Handling**: Comprehensive error handling and status events
- **TypeScript Support**: Full TypeScript definitions included
- **Easy Integration**: Simple API for quick implementation

## Installation

Simply include the SDK in your project:

```html
<script type="module">
  import { VoiceSignal } from './sdk/index.js';
</script>
```

Or copy the files to your project directory.

## Usage

### Basic Setup

```javascript
import { VoiceSignal } from './sdk/index.js';

const voiceCall = new VoiceSignal({
  serverUrl: 'wss://your-signaling-server.com',
  roomId: 'room-123',
  userId: 'user-456'
});

// Handle local stream
voiceCall.on('localStream', (stream) => {
  // Display local video/audio stream
  document.getElementById('localVideo').srcObject = stream;
});

// Handle remote streams
voiceCall.on('stream', (stream, userId) => {
  // Display remote user's video/audio stream
  document.getElementById('remoteVideo-' + userId).srcObject = stream;
});

// Join the call
await voiceCall.join();
```

### Device Selection

```javascript
// Enumerate available devices
const devices = await voiceCall.enumerateDevices();

// Switch audio device
await voiceCall.switchAudioDevice(deviceId);

// Switch video device
await voiceCall.switchVideoDevice(deviceId);
```

### Event Handling

```javascript
voiceCall.on('joined', () => {
  console.log('Successfully joined the room');
});

voiceCall.on('userJoined', (userId) => {
  console.log('User joined:', userId);
});

voiceCall.on('userLeft', (userId) => {
  console.log('User left:', userId);
});

voiceCall.on('error', (error) => {
  console.error('SDK Error:', error);
});
```

## API Reference

### Constructor Options

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `serverUrl` | string | WebSocket URL of the signaling server | Required |
| `roomId` | string | Unique identifier for the room/session | Required |
| `userId` | string | Unique identifier for the current user | Required |
| `video` | boolean | Enable video | `true` |
| `audio` | boolean | Enable audio | `true` |
| `iceServers` | RTCIceServer[] | ICE servers for NAT traversal | STUN only |
| `turnCredentials` | RTCIceServer | TURN server credentials | `null` |
| `audioDeviceId` | string | Specific audio device ID | `null` |
| `videoDeviceId` | string | Specific video device ID | `null` |

### Methods

| Method | Description |
|--------|-------------|
| `join()` | Join a room and establish connections |
| `leave()` | Leave the room and close all connections |
| `muteMic(mute)` | Toggle microphone mute state |
| `toggleCamera(off)` | Toggle camera on/off |
| `enumerateDevices()` | List available media devices |
| `switchAudioDevice(deviceId)` | Switch to a different audio device |
| `switchVideoDevice(deviceId)` | Switch to a different video device |
| `getPeers()` | Get list of connected peers |
| `isConnected()` | Check if connected to signaling server |

### Events

| Event | Parameters | Description |
|-------|------------|-------------|
| `joined` | - | Successfully joined the room |
| `userJoined` | `userId` | A new user joined the room |
| `userLeft` | `userId` | A user left the room |
| `localStream` | `stream` | Local media stream is available |
| `stream` | `stream, userId` | Remote user's stream is available |
| `micMuted` | `muted` | Microphone mute state changed |
| `cameraToggled` | `off` | Camera state changed |
| `connectionStateChange` | `state, userId` | Peer connection state changed |
| `iceConnectionStateChange` | `state, userId` | ICE connection state changed |
| `devicesEnumerated` | `devices` | Media devices have been enumerated |
| `audioDeviceChanged` | `deviceId` | Audio device was changed |
| `videoDeviceChanged` | `deviceId` | Video device was changed |
| `disconnected` | - | Disconnected from signaling server |
| `left` | - | Left the room |
| `error` | `error` | An error occurred |

## Server Implementation

The signaling server ([server.js](file:///Users/meetsonawane/Code/node/voicesignal/server.js)) is a Node.js application that:

- Uses WebSocket for real-time signaling between peers
- Implements room-based session management
- Handles WebRTC signaling messages (offer, answer, ICE candidates)
- Provides heartbeat mechanism to detect dead connections
- Includes error handling and message validation
- Supports multiple concurrent rooms

To run the signaling server:
```bash
npm start
```

## Testing

To test the SDK, open `sdk/test.html` in a browser. The test interface demonstrates:

- Video and audio calling
- Device selection
- Mute/unmute controls
- Connection status monitoring

## Browser Support

- Chrome 70+
- Firefox 60+
- Safari 12+
- Edge 79+

## License

MIT