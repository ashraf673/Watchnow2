// =====================================================
// Watchnow - Main Application Logic
// =====================================================

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const devicesScreen = document.getElementById('devices-screen');
const deviceDetailsScreen = document.getElementById('device-details-screen');
const photosScreen = document.getElementById('photos-screen');
const settingsScreen = document.getElementById('settings-screen');
const viewerScreen = document.getElementById('viewer-screen');
const googleLoginBtn = document.getElementById('google-login-btn');
const activationLoginBtn = document.getElementById('activation-login-btn');
const activationInputBox = document.getElementById('activation-input-box');
const activationCodeInput = document.getElementById('activation-code-input');
const activationSubmitBtn = document.getElementById('activation-submit-btn');
const logoutBtn = document.getElementById('logout-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsBackBtn = document.getElementById('settings-back-btn');
const backBtn = document.getElementById('back-btn');
const detailsBackBtn = document.getElementById('details-back-btn');
const photosBackBtn = document.getElementById('photos-back-btn');
const devicesList = document.getElementById('devices-list');
const emptyState = document.getElementById('empty-state');
const activationCodeDisplay = document.getElementById('activation-code-display');
const copyCodeBtn = document.getElementById('copy-code-btn');
const remoteVideo = document.getElementById('remote-video');
const noStream = document.getElementById('no-stream');
const viewerTitle = document.getElementById('viewer-title');
const detailsTitle = document.getElementById('details-title');
const deviceStatusInfo = document.getElementById('device-status-info');
const mediaGrid = document.getElementById('media-grid');
const mediaLoadControls = document.getElementById('media-load-controls');

// State
let currentUser = null;
let currentUid = null;
let currentDeviceId = null;
let currentDeviceData = null;
let peerConnection = null;
let signalingRef = null;
let inboundStream = null;
let pendingSenderCandidates = [];
let cameraEnabled = true;
let offerListener = null;
let senderCandidatesListener = null;
let currentMediaTab = 'image';
let mediaItems = [];

function showStatus(msg) {
  const existing = document.getElementById('status-msg');
  if (existing) existing.remove();
  const div = document.createElement('div');
  div.id = 'status-msg';
  div.style.cssText = 'position:fixed;bottom:20px;left:20px;right:20px;background:#1e293b;color:white;padding:12px;border-radius:8px;z-index:9999;font-size:14px;text-align:center;';
  div.textContent = msg;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 4000);
}

function generateActivationCode() {
  return 'WN-' + Math.random().toString(36).substring(2, 10).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
}

function generateQR(code) {
  const canvas = document.getElementById('activation-qr');
  if (!canvas || !code) return;
  QRCode.toCanvas(canvas, code, { width: 200, margin: 2 }, function (error) {
    if (error) console.error(error);
  });
}

function sendCommand(command) {
  if (!currentDeviceId) return;
  database.ref(`commands/${currentDeviceId}`).push(command);
  showStatus(command.replace('_', ' '));
}

function getSignalBars(bars) {
  const filled = '▮'.repeat(Math.max(0, Math.min(4, bars || 0)));
  const empty = '▯'.repeat(4 - (bars || 0));
  return filled + empty;
}

function formatSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDuration(ms) {
  if (!ms) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min + ':' + sec.toString().padStart(2, '0');
}

// =====================================================
// Auth - Google
// =====================================================

auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(err => console.error(err));

googleLoginBtn.addEventListener('click', async () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    googleLoginBtn.disabled = true;
    googleLoginBtn.textContent = 'Opening Google...';
    showStatus('Opening Google login...');
    await auth.signInWithPopup(provider);
  } catch (error) {
    console.error(error);
    showStatus('Login failed: ' + error.message);
    googleLoginBtn.disabled = false;
    googleLoginBtn.innerHTML = `<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" /> Continue with Google`;
  }
});

auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    currentUid = user.uid;
    localStorage.setItem('watchnow_uid', currentUid);
    await ensureActivationCode(user.uid);
    showScreen('devices');
    loadDevices();
  } else if (!currentUid) {
    showScreen('login');
  }
});

async function ensureActivationCode(uid) {
  const codeRef = database.ref(`users/${uid}/activationCode`);
  const snap = await codeRef.once('value');
  if (!snap.exists()) {
    const code = generateActivationCode();
    await codeRef.set(code);
    await database.ref(`activationCodes/${code}`).set({ uid: uid });
  }
}

// =====================================================
// Activation Code Login
// =====================================================

activationLoginBtn.addEventListener('click', () => {
  activationInputBox.classList.remove('hidden');
  activationLoginBtn.classList.add('hidden');
});

activationSubmitBtn.addEventListener('click', async () => {
  const code = activationCodeInput.value.trim().toUpperCase();
  if (!code) {
    showStatus('Please enter activation code');
    return;
  }

  activationSubmitBtn.disabled = true;
  activationSubmitBtn.textContent = 'Checking...';

  try {
    const snap = await database.ref(`activationCodes/${code}`).once('value');
    if (snap.exists()) {
      const data = snap.val();
      currentUid = data.uid;
      currentUser = { uid: currentUid };
      localStorage.setItem('watchnow_uid', currentUid);
      showStatus('Login successful');
      showScreen('devices');
      loadDevices();
    } else {
      showStatus('Invalid activation code');
    }
  } catch (err) {
    showStatus('Error: ' + err.message);
  }

  activationSubmitBtn.disabled = false;
  activationSubmitBtn.textContent = 'Continue';
});

const savedUid = localStorage.getItem('watchnow_uid');
if (savedUid) {
  currentUid = savedUid;
  currentUser = { uid: savedUid };
  showScreen('devices');
  loadDevices();
}

// =====================================================
// Logout
// =====================================================

logoutBtn.addEventListener('click', async () => {
  localStorage.removeItem('watchnow_uid');
  currentUid = null;
  currentUser = null;
  await auth.signOut();
  showScreen('login');
  activationInputBox.classList.add('hidden');
  activationLoginBtn.classList.remove('hidden');
  showStatus('Logged out');
});

// =====================================================
// Settings
// =====================================================

settingsBtn.addEventListener('click', async () => {
  showScreen('settings');
  if (currentUid) {
    const snap = await database.ref(`users/${currentUid}/activationCode`).once('value');
    const code = snap.val() || 'Not found';
    activationCodeDisplay.textContent = code;
    if (code && code !== 'Not found') {
      generateQR(code);
    }
  }
});

settingsBackBtn.addEventListener('click', () => {
  showScreen('devices');
});

copyCodeBtn.addEventListener('click', () => {
  const code = activationCodeDisplay.textContent;
  if (code && code !== 'Loading...' && code !== 'Not found') {
    navigator.clipboard.writeText(code).then(() => {
      showStatus('Activation code copied');
    }).catch(() => {
      showStatus('Copy failed');
    });
  }
});

// =====================================================
// Navigation
// =====================================================

function showScreen(name) {
  loginScreen.classList.add('hidden');
  devicesScreen.classList.add('hidden');
  deviceDetailsScreen.classList.add('hidden');
  photosScreen.classList.add('hidden');
  settingsScreen.classList.add('hidden');
  viewerScreen.classList.add('hidden');

  if (name === 'login') loginScreen.classList.remove('hidden');
  if (name === 'devices') devicesScreen.classList.remove('hidden');
  if (name === 'details') deviceDetailsScreen.classList.remove('hidden');
  if (name === 'photos') photosScreen.classList.remove('hidden');
  if (name === 'settings') settingsScreen.classList.remove('hidden');
  if (name === 'viewer') viewerScreen.classList.remove('hidden');
}

backBtn.addEventListener('click', () => {
  stopViewer();
  showScreen('details');
});

detailsBackBtn.addEventListener('click', () => {
  showScreen('devices');
});

photosBackBtn.addEventListener('click', () => {
  showScreen('details');
});

// =====================================================
// Devices
// =====================================================

function loadDevices() {
  if (!currentUid) return;

  const devicesRef = database.ref(`users/${currentUid}/devices`);

  devicesRef.on('value', (snapshot) => {
    const devices = snapshot.val() || {};
    renderDevices(devices);
  });
}

function renderDevices(devices) {
  const deviceIds = Object.keys(devices);

  const cards = devicesList.querySelectorAll('.device-card');
  cards.forEach(card => card.remove());

  const oldDisabled = document.getElementById('disabled-section');
  if (oldDisabled) oldDisabled.remove();

  const activeDevices = [];
  const disabledDevices = [];

  deviceIds.forEach(id => {
    if (devices[id].disabled) {
      disabledDevices.push({ id, ...devices[id] });
    } else {
      activeDevices.push({ id, ...devices[id] });
    }
  });

  if (activeDevices.length === 0 && disabledDevices.length === 0) {
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';

  activeDevices.forEach(device => {
    devicesList.appendChild(createDeviceCard(device, false));
  });

  if (disabledDevices.length > 0) {
    const section = document.createElement('div');
    section.id = 'disabled-section';
    section.innerHTML = `<div class="section-title" style="margin-top:24px;">Disabled Devices</div>`;
    devicesList.appendChild(section);

    disabledDevices.forEach(device => {
      devicesList.appendChild(createDeviceCard(device, true));
    });
  }
}

function createDeviceCard(device, isDisabled) {
  const card = document.createElement('div');
  card.className = 'device-card';
  if (isDisabled) card.style.opacity = '0.6';
  card.style.cursor = 'pointer';

  const battery = device.battery != null ? device.battery + '%' : '--';
  const networkType = device.networkType || 'unknown';
  const bars = device.signalBars || 0;
  const networkIcon = networkType === 'wifi' ? '📶' : (networkType === 'mobile' ? '📶' : '');
  const signal = getSignalBars(bars);

  const statusText = isDisabled ? 'Disabled' : (device.online ? 'Online' : 'Offline');

  card.innerHTML = `
    <div class="device-info">
      <h3>${device.name || 'Unknown Device'}</h3>
      <p>${statusText}</p>
      <p style="font-size:13px; margin-top:4px;">${networkIcon} ${signal} &nbsp; 🔋 ${battery}</p>
    </div>
    <div class="device-actions">
      <button class="action-btn menu-btn" title="More">⋮</button>
    </div>
  `;

  card.addEventListener('click', (e) => {
    if (e.target.closest('.menu-btn')) return;
    openDeviceDetails(device);
  });

  const menuBtn = card.querySelector('.menu-btn');
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showDeviceMenu(device.id, device.name, isDisabled);
  });

  return card;
}

function openDeviceDetails(device) {
  currentDeviceId = device.id;
  currentDeviceData = device;
  detailsTitle.textContent = device.name || 'Device';

  const battery = device.battery != null ? device.battery + '%' : 'Unknown';
  const network = device.networkType === 'wifi' ? 'Wi-Fi' : (device.networkType === 'mobile' ? 'Mobile Data' : 'Unknown');
  const bars = getSignalBars(device.signalBars || 0);

  deviceStatusInfo.innerHTML = `
    <div><strong>Network:</strong> ${network} ${bars}</div>
    <div style="margin-top:8px;"><strong>Battery:</strong> ${battery}</div>
  `;

  showScreen('details');
}

document.getElementById('open-camera-btn').addEventListener('click', () => {
  if (currentDeviceId) openViewer(currentDeviceId, currentDeviceData?.name || 'Device');
});

document.getElementById('open-location-btn').addEventListener('click', () => {
  if (currentDeviceId) showLocation(currentDeviceId);
});

document.getElementById('open-photos-btn').addEventListener('click', () => {
  if (currentDeviceId) openPhotos();
});

document.getElementById('open-files-btn').addEventListener('click', () => {
  showStatus('File Manager coming soon');
});

document.getElementById('scan-media-btn').addEventListener('click', () => {
  if (currentDeviceId) {
    sendCommand('scan_media');
    showStatus('Scanning media on device...');
  }
});

document.getElementById('tab-photos').addEventListener('click', () => {
  currentMediaTab = 'image';
  renderMediaGrid();
});

document.getElementById('tab-videos').addEventListener('click', () => {
  currentMediaTab = 'video';
  renderMediaGrid();
});

function openPhotos() {
  showScreen('photos');
  loadMedia();
  updateLoadControls();
}

function updateLoadControls() {
  const isMobile = currentDeviceData?.networkType === 'mobile';
  mediaLoadControls.innerHTML = '';

  if (isMobile) {
    if (currentMediaTab === 'image') {
      mediaLoadControls.innerHTML = '<button class="btn btn-secondary" id="load-thumbs-btn">Load Thumbnails</button>';
    } else {
      mediaLoadControls.innerHTML = `
        <button class="btn btn-secondary" style="background:#ef4444;color:white;margin-right:8px;" id="load-video-thumbs-btn">Show Thumbnail</button>
        <button class="btn btn-secondary" style="background:#ef4444;color:white;" id="load-video-preview-btn">Preview</button>
      `;
    }
  }
}

let mediaListener = null;
function loadMedia() {
  if (!currentUid || !currentDeviceId) return;
  if (mediaListener) {
    database.ref(`users/${currentUid}/devices/${currentDeviceId}/media`).off('value', mediaListener);
  }
  mediaListener = database.ref(`users/${currentUid}/devices/${currentDeviceId}/media`).on('value', (snap) => {
    mediaItems = [];
    snap.forEach(child => {
      mediaItems.push({ id: child.key, ...child.val() });
    });
    mediaItems.sort((a, b) => (b.date || 0) - (a.date || 0));
    renderMediaGrid();
  });
}

function renderMediaGrid() {
  mediaGrid.innerHTML = '';
  const filtered = mediaItems.filter(m => m.type === currentMediaTab);

  if (filtered.length === 0) {
    mediaGrid.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:40px;">No media yet. Tap scan to load.</p>';
    return;
  }

  const isWifi = currentDeviceData?.networkType === 'wifi';

  filtered.forEach(item => {
    const div = document.createElement('div');
    div.className = 'media-item';
    div.style.cssText = 'position:relative;aspect-ratio:1;background:#1e293b;border-radius:8px;overflow:hidden;cursor:pointer;';

    if (item.thumbnail && (isWifi || currentMediaTab === 'image')) {
      div.innerHTML = `<img src="${item.thumbnail}" style="width:100%;height:100%;object-fit:cover;" />`;
    } else {
      div.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;font-size:12px;">${item.name}</div>`;
    }

    const sizeLabel = document.createElement('div');
    sizeLabel.style.cssText = 'position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,0.7);color:white;font-size:10px;padding:2px 4px;border-radius:4px;';
    sizeLabel.textContent = formatSize(item.size);
    div.appendChild(sizeLabel);

    if (item.type === 'video') {
      const durLabel = document.createElement('div');
      durLabel.style.cssText = 'position:absolute;bottom:4px;left:4px;background:rgba(0,0,0,0.7);color:white;font-size:10px;padding:2px 4px;border-radius:4px;';
      durLabel.textContent = formatDuration(item.duration);
      div.appendChild(durLabel);
    }

    div.addEventListener('click', () => showMediaOptions(item));
    mediaGrid.appendChild(div);
  });
}

function showMediaOptions(item) {
  const isMobile = currentDeviceData?.networkType === 'mobile';
  const size = formatSize(item.size);
  let msg = `Download ${item.name}? (${size})`;
  if (isMobile) {
    msg = `The sender phone is using mobile data. Do you want to download this file? (${size})`;
  }
  if (confirm(msg)) {
    showStatus('Download requested (full file transfer coming next)');
  }
}

function showLocation(deviceId) {
  if (!currentUid) return;
  database.ref(`users/${currentUid}/devices/${deviceId}/location`).once('value').then(snap => {
    const loc = snap.val();
    if (loc && loc.lat && loc.lng) {
      const url = `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;
      window.open(url, '_blank');
    } else {
      showStatus('No location available yet');
    }
  }).catch(() => showStatus('Failed to load location'));
}

function showDeviceMenu(deviceId, deviceName, isDisabled) {
  const existing = document.getElementById('device-menu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.id = 'device-menu';
  menu.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#1e293b;border-radius:12px;padding:8px 0;z-index:10000;min-width:200px;box-shadow:0 4px 20px rgba(0,0,0,0.4);';

  const options = isDisabled
    ? [{ label: 'Enable Device', action: 'enable' }, { label: 'Delete Device', action: 'delete' }]
    : [{ label: 'Disable Device', action: 'disable' }, { label: 'Delete Device', action: 'delete' }];

  options.forEach(opt => {
    const item = document.createElement('div');
    item.textContent = opt.label;
    item.style.cssText = 'padding:14px 20px;cursor:pointer;font-size:15px;';
    item.onclick = () => {
      menu.remove();
      if (opt.action === 'delete') deleteDevice(deviceId, deviceName);
      if (opt.action === 'disable') setDeviceDisabled(deviceId, true);
      if (opt.action === 'enable') setDeviceDisabled(deviceId, false);
    };
    menu.appendChild(item);
  });

  const cancel = document.createElement('div');
  cancel.textContent = 'Cancel';
  cancel.style.cssText = 'padding:14px 20px;cursor:pointer;color:#94a3b8;border-top:1px solid #334155;';
  cancel.onclick = () => menu.remove();
  menu.appendChild(cancel);

  document.body.appendChild(menu);

  setTimeout(() => {
    document.addEventListener('click', function close() {
      menu.remove();
      document.removeEventListener('click', close);
    }, { once: true });
  }, 100);
}

function deleteDevice(deviceId, deviceName) {
  if (!confirm(`Permanently delete "${deviceName}"?\n\nThis device will never reconnect to your account.`)) return;

  database.ref(`users/${currentUid}/devices/${deviceId}`).remove()
    .then(() => showStatus('Device deleted'))
    .catch(err => showStatus('Error: ' + err.message));
}

function setDeviceDisabled(deviceId, disabled) {
  database.ref(`users/${currentUid}/devices/${deviceId}/disabled`).set(disabled)
    .then(() => showStatus(disabled ? 'Device disabled' : 'Device enabled'))
    .catch(err => showStatus('Error: ' + err.message));
}

// =====================================================
// Live Viewer (WebRTC)
// =====================================================

async function openViewer(deviceId, deviceName) {
  await stopViewer();

  currentDeviceId = deviceId;
  viewerTitle.textContent = deviceName;
  showScreen('viewer');
  noStream.style.display = 'flex';
  noStream.innerHTML = '<p>Connecting to device...</p>';
  inboundStream = new MediaStream();
  pendingSenderCandidates = [];
  cameraEnabled = true;

  await database.ref(`signaling/${deviceId}`).remove();
  await database.ref(`commands/${deviceId}`).push('start_stream');
  await new Promise(r => setTimeout(r, 600));

  await startWebRTC(deviceId);
}

async function startWebRTC(deviceId) {
  const configuration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  peerConnection = new RTCPeerConnection(configuration);

  peerConnection.ontrack = (event) => {
    console.log('Track received:', event.track.kind);

    if (event.streams && event.streams[0]) {
      remoteVideo.srcObject = event.streams[0];
    } else {
      const alreadyAdded = inboundStream.getTracks().some(t => t.id === event.track.id);
      if (!alreadyAdded) {
        inboundStream.addTrack(event.track);
      }
      remoteVideo.srcObject = inboundStream;
    }

    event.track.onunmute = () => {
      noStream.style.display = 'none';
      remoteVideo.play().catch(err => console.warn('Playback blocked:', err));
    };
  };

  peerConnection.onconnectionstatechange = () => {
    console.log('Connection state:', peerConnection.connectionState);
    if (peerConnection.connectionState === 'connected') {
      showStatus('Live');
    } else if (peerConnection.connectionState === 'failed') {
      showStatus('Connection failed');
    }
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      database.ref(`signaling/${deviceId}/viewerCandidates`).push({
        sdpMid: event.candidate.sdpMid,
        sdpMLineIndex: event.candidate.sdpMLineIndex,
        sdp: event.candidate.candidate
      });
    }
  };

  signalingRef = database.ref(`signaling/${deviceId}`);

  offerListener = signalingRef.child('offer').on('value', async (snap) => {
    const offer = snap.val();
    if (!offer || !peerConnection) return;
    if (peerConnection.signalingState !== 'stable' && peerConnection.signalingState !== 'have-local-offer') return;

    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription({
        type: offer.type,
        sdp: offer.sdp
      }));

      for (const cand of pendingSenderCandidates) {
        try { await peerConnection.addIceCandidate(cand); } catch (e) { console.error(e); }
      }
      pendingSenderCandidates = [];

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      await signalingRef.child('answer').set({
        type: answer.type,
        sdp: answer.sdp
      });
      showStatus('Answer sent — waiting for media');
    } catch (err) {
      console.error('WebRTC error', err);
      showStatus('Connection error');
    }
  });

  senderCandidatesListener = signalingRef.child('senderCandidates').on('child_added', (snap) => {
    const data = snap.val();
    if (!data || !peerConnection) return;

    const candidate = new RTCIceCandidate({
      sdpMid: data.sdpMid,
      sdpMLineIndex: data.sdpMLineIndex,
      candidate: data.sdp
    });

    if (!peerConnection.remoteDescription) {
      pendingSenderCandidates.push(candidate);
      return;
    }

    peerConnection.addIceCandidate(candidate).catch(console.error);
  });
}

async function stopViewer() {
  if (currentDeviceId) {
    try {
      await database.ref(`commands/${currentDeviceId}`).push('stop_stream');
    } catch (e) {}
  }

  if (peerConnection) {
    try { peerConnection.close(); } catch (e) {}
    peerConnection = null;
  }

  if (signalingRef) {
    if (offerListener) {
      signalingRef.child('offer').off('value', offerListener);
      offerListener = null;
    }
    if (senderCandidatesListener) {
      signalingRef.child('senderCandidates').off('child_added', senderCandidatesListener);
      senderCandidatesListener = null;
    }
    signalingRef.off();
    signalingRef = null;
  }

  remoteVideo.srcObject = null;
  inboundStream = null;
  pendingSenderCandidates = [];
  noStream.style.display = 'flex';
  noStream.innerHTML = '<p>Disconnected</p>';
}

document.getElementById('switch-camera-btn').addEventListener('click', () => sendCommand('switch_camera'));
document.getElementById('flashlight-btn').addEventListener('click', () => sendCommand('flashlight'));
document.getElementById('location-btn').addEventListener('click', () => {
  if (currentDeviceId) showLocation(currentDeviceId);
});
document.getElementById('camera-off-btn').addEventListener('click', () => {
  cameraEnabled = !cameraEnabled;
  sendCommand(cameraEnabled ? 'camera_on' : 'camera_off');
});