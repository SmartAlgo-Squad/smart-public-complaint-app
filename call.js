/**
 * call.js — AI Voice Call Feature (Fixed & Robust)
 * --------------------------------------------------
 * Flow:
 *  1. "Call Now" → openCallScreen() shows overlay
 *  2. AI speaks greeting (SpeechSynthesis)
 *  3. User taps 🎙️  → SpeechRecognition captures voice
 *  4. Transcript sent to Gemini 1.5 Flash → AI reply text
 *  5. Reply spoken aloud (SpeechSynthesis)
 *  6. Repeat until "End Call"
 *
 * No Firebase — demo only.
 */

/* ───────────────────────────────────────────────────────────
   CONFIG
─────────────────────────────────────────────────────────── */
var GEMINI_KEY = 'AIzaSyBCfQ8_lSU1N_Wg7kKzCtYg4_-VkloPIwY';
var GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + GEMINI_KEY;

var CALL_SYSTEM_PROMPT =
  'You are a professional, empathetic AI assistant for a Smart Public Complaint Application in India. ' +
  'You are conducting a formal phone call to register a citizen\'s complaint. ' +
  'Follow this exact conversation flow:\n' +
  '1. GREETING: Start by greeting politely, e.g., "Hello Sir or Ma\'am, thank you for calling."\n' +
  '2. LANGUAGE SELECTION: Ask for language preference: "Press 1 for English, or Press 2 for Hindi. Which would you prefer?"\n' +
  '3. LANGUAGE ACKNOWLEDGMENT: If Hindi is chosen, respond with "Dhanyavaad" (Thank you in Hindi). If English, say "Thank you".\n' +
  '4. INTRODUCTION: Say "I am your complaint assistant. Please tell me your issue or complaint. What would you like to register?"\n' +
  '5. ACTIVE LISTENING: Listen carefully to the user\'s complaint. Acknowledge their concern with empathy.\n' +
  '6. CLARIFICATION: Ask for any missing details (location, date/time, severity) to complete the complaint registration.\n' +
  '7. CONFIRMATION: Once you have all details, say "Your complaint has been successfully registered. We will look into this matter."\n' +
  '8. CLOSING: End politely: "Thank you for calling. Have a great day. Goodbye."\n' +
  'Keep all responses concise, warm, and in the chosen language (match the language chosen by the user). ' +
  'Be professional yet empathetic throughout the call.';

/* ───────────────────────────────────────────────────────────
   STATE
─────────────────────────────────────────────────────────── */
var _callActive      = false;
var _callTimer       = null;
var _callStartTime   = null;
var _recognition     = null;
var _micListening    = false;
var _aiSpeaking      = false;
var _callHistory     = [];   // {role:'user'|'model', parts:[{text:'...'}]}
var _userName        = '';   // User's name captured before call
var _userLanguage    = 'en-IN'; // User's language preference
var _selectedVoice   = null; // Selected voice object
var _callStage       = 'greeting'; // Call flow stage: greeting → language → intro → complaint → confirm → closing
var _keyListener = null;

/* ───────────────────────────────────────────────────────────
   KEYBOARD INPUT FOR LANGUAGE SELECTION
─────────────────────────────────────────────────────────── */
function handleKeyPress(e) {
  if (!_callActive || _callStage !== 'language') return;
  
  var key = e.key;
  if (key === '1' || key === '2') {
    e.preventDefault();
    // Simulate voice input
    var langText = key === '2' ? 'English' : 'Hindi';
    callProcessStage(langText);
  }
}

/* ───────────────────────────────────────────────────────────
   SAFE DOM HELPER — avoids any conflict with jQuery / other $
─────────────────────────────────────────────────────────── */
function callEl(id) {
  return document.getElementById(id);
}

/* ───────────────────────────────────────────────────────────
   UI UPDATERS
─────────────────────────────────────────────────────────── */
function callSetStatus(text) {
  var el = callEl('callStatusLabel');
  if (el) el.textContent = text;
  
  // Add ringing animation when status is "Ringing..."
  var avatar = callEl('callAvatar');
  if (avatar) {
    if (text === 'Ringing...') {
      avatar.classList.add('ringing');
    } else {
      avatar.classList.remove('ringing');
    }
  }
}

function callSetWaveform(on) {
  var el = callEl('callWaveform');
  if (!el) return;
  if (on) el.classList.add('active');
  else    el.classList.remove('active');
}

function callSetAvatarSpeaking(on) {
  var el = callEl('callAvatar');
  if (!el) return;
  if (on) el.classList.add('speaking');
  else    el.classList.remove('speaking');
}

function callSetMicUI(on) {
  var btn      = callEl('callMuteBtn');
  var status   = callEl('callMicStatus');
  var micIcon  = callEl('callMicIcon');
  var btnIcon  = callEl('callMuteBtnIcon');
  var micLabel = callEl('callMicLabel');

  if (btn)     { if (on) btn.classList.add('listening');    else btn.classList.remove('listening'); }
  if (status)  { if (on) status.classList.add('listening'); else status.classList.remove('listening'); }
  if (micIcon)  micIcon.textContent  = on ? '🔴' : '🎤';
  if (btnIcon)  btnIcon.textContent  = on ? '⏹️' : '🎙️';
  if (micLabel) micLabel.textContent = on ? 'Listening… speak now' : 'Tap mic to speak';

  callSetWaveform(on);
}

/* Add a message bubble to the live transcript */
function callAppendTranscript(role, text) {
  var container = callEl('callTranscript');
  if (!container) return;

  var isAI = (role === 'ai');
  var line  = document.createElement('div');
  line.className = isAI ? 'transcript-line-ai' : 'transcript-line-user';

  var label = document.createElement('span');
  label.className   = 'transcript-label';
  label.textContent = isAI ? 'AI' : 'You';

  var bubble = document.createElement('div');
  bubble.className   = 'transcript-bubble';
  bubble.textContent = text;

  if (isAI) {
    line.appendChild(label);
    line.appendChild(bubble);
  } else {
    line.appendChild(bubble);
    line.appendChild(label);
  }

  container.appendChild(line);

  // Auto-scroll
  var panel = callEl('callTranscriptPanel');
  if (panel) panel.scrollTop = panel.scrollHeight;
}

/* ───────────────────────────────────────────────────────────
   CALL TIMER
─────────────────────────────────────────────────────────── */
function callStartTimer() {
  _callStartTime = Date.now();
  _callTimer = setInterval(function () {
    var secs = Math.floor((Date.now() - _callStartTime) / 1000);
    var mm   = String(Math.floor(secs / 60)).padStart(2, '0');
    var ss   = String(secs % 60).padStart(2, '0');
    var el   = callEl('callDuration');
    if (el) el.textContent = mm + ':' + ss;
  }, 1000);
}

function callStopTimer() {
  if (_callTimer) { clearInterval(_callTimer); _callTimer = null; }
}

/* ───────────────────────────────────────────────────────────
   TEXT-TO-SPEECH
─────────────────────────────────────────────────────────── */
function callSpeak(text, onDone) {
  // Stop anything already speaking
  window.speechSynthesis.cancel();

  if (!text) { if (typeof onDone === 'function') onDone(); return; }

  var utter  = new SpeechSynthesisUtterance(text);
  var voices = window.speechSynthesis.getVoices();

  // Use selected voice, or pick an Indian/Hindi voice; fall back to any English
  var voice = _selectedVoice || voices.find(function (v) {
    return v.lang === 'hi-IN' || v.lang === 'en-IN' || v.name.toLowerCase().indexOf('india') !== -1;
  }) || voices.find(function (v) {
    return v.lang.startsWith('en');
  }) || (voices.length ? voices[0] : null);

  if (voice) utter.voice = voice;
  utter.lang   = (voice && voice.lang) || _userLanguage || 'en-IN';
  utter.rate   = 0.92;
  utter.pitch  = 1.05;
  utter.volume = 1;

  _aiSpeaking = true;
  callSetAvatarSpeaking(true);
  callSetWaveform(true);
  callSetStatus('AI Speaking…');

  function onEnd() {
    _aiSpeaking = false;
    callSetAvatarSpeaking(false);
    callSetWaveform(false);
    callSetStatus('Connected');
    if (typeof onDone === 'function') onDone();
  }

  utter.onend   = onEnd;
  utter.onerror = onEnd;

  window.speechSynthesis.speak(utter);

  // Chrome bug: speechSynthesis sometimes stalls — nudge it every 10 s
  var nudge = setInterval(function () {
    if (!window.speechSynthesis.speaking) { clearInterval(nudge); return; }
    window.speechSynthesis.pause();
    window.speechSynthesis.resume();
  }, 10000);
  utter.onend = function () { clearInterval(nudge); onEnd(); };
  utter.onerror = function () { clearInterval(nudge); onEnd(); };
}

/* Wrapper that waits for voices if they haven't loaded yet */
function callSpeakWhenReady(text, onDone) {
  if (window.speechSynthesis.getVoices().length > 0) {
    callSpeak(text, onDone);
  } else {
    window.speechSynthesis.onvoiceschanged = function () {
      window.speechSynthesis.onvoiceschanged = null;
      callSpeak(text, onDone);
    };
    // Some browsers never fire onvoiceschanged — fallback after 800 ms
    setTimeout(function () { callSpeak(text, onDone); }, 800);
  }
}

async function ensureMicrophoneAccess() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return false;
  }

  try {
    var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(function (track) { track.stop(); });
    return true;
  } catch (err) {
    console.warn('[CallAI] Microphone permission failed:', err);
    return false;
  }
}

/* ───────────────────────────────────────────────────────────
   GEMINI API
─────────────────────────────────────────────────────────── */
function callAskGemini(userText, callback) {
  // Push user turn to history
  _callHistory.push({ role: 'user', parts: [{ text: userText }] });

  // Use systemInstruction for the system prompt (correct Gemini v1beta format)
  var body = JSON.stringify({
    systemInstruction: {
      parts: [{ text: CALL_SYSTEM_PROMPT }]
    },
    contents: _callHistory,
    generationConfig: { temperature: 0.8, maxOutputTokens: 250 }
  });

  fetch(GEMINI_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    body
  })
  .then(function (res) {
    if (!res.ok) {
      return res.text().then(function(t) { throw new Error('API ' + res.status + ': ' + t); });
    }
    return res.json();
  })
  .then(function (data) {
    var reply = (
      data &&
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text
    ) || 'Main samajh gaya. Kripya aage bataiye.';

    // Push model turn to history
    _callHistory.push({ role: 'model', parts: [{ text: reply }] });
    callback(null, reply);
  })
  .catch(function (err) {
    console.error('[CallAI] Gemini error:', err);
    callback(err, 'I am sorry, there was a technical issue. Please try again.');
  });
}

/* ───────────────────────────────────────────────────────────
   SPEECH RECOGNITION
─────────────────────────────────────────────────────────── */
function callMakeRecognition() {
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { return null; }

  var rec = new SR();
  
  // Set language based on user preference
  if (_userLanguage === 'hi-IN') {
    rec.lang = 'hi-IN';
  } else {
    rec.lang = 'en-IN';
  }
  
  rec.interimResults = true;  // Show interim results as user speaks
  rec.maxAlternatives = 1;
  rec.continuous = true;  // Keep listening until explicitly stopped
  
  var finalTranscript = '';

  rec.onstart = function () {
    _micListening = true;
    callSetMicUI(true);
    callSetStatus('Listening…');
    finalTranscript = '';
  };

  rec.onresult = function (e) {
    var interimTranscript = '';
    
    for (var i = e.resultIndex; i < e.results.length; i++) {
      var transcript = e.results[i][0].transcript;
      
      if (e.results[i].isFinal) {
        finalTranscript += transcript + ' ';
      } else {
        interimTranscript += transcript;
      }
    }

    // If we got a final result, process it
    if (finalTranscript.trim()) {
      var text = finalTranscript.trim();
      console.log('[CallAI] User said:', text);
      
      // Stop recording after we got final result
      if (rec) {
        try { rec.stop(); } catch (e) {}
      }
      
      _micListening = false;
      callSetMicUI(false);
      callSetStatus('Processing…');
      
      // Route to appropriate call stage handler
      if (_callStage === 'language' || _callStage === 'complaint') {
        callProcessStage(text);
      } else {
        callAppendTranscript('user', text);
        callAskGemini(text, function (err, reply) {
          if (!_callActive) return;
          callAppendTranscript('ai', reply);
          callSpeakWhenReady(reply);
        });
      }
    }
  };

  rec.onspeechstart = function () {
    callSetStatus('Listening…');
  };

  rec.onnomatch = function () {
    callSetStatus('Connected');
    callAppendTranscript('ai', 'I heard something, but could not understand it clearly. Please tap Speak and say it again.');
  };

  rec.onerror = function (e) {
    console.warn('[CallAI] Mic error:', e.error);
    _micListening = false;
    callSetMicUI(false);
    callSetStatus('Connected');

    if (e.error === 'not-allowed' || e.error === 'permission-denied') {
      callAppendTranscript('ai',
        'Microphone permission was denied. Please allow microphone access in your browser settings and try again.');
    } else if (e.error === 'no-speech') {
      callAppendTranscript('ai',
        'I could not hear anything. Please tap the Speak button and speak clearly near your microphone.');
    } else if (e.error === 'network') {
      callAppendTranscript('ai',
        'There is a network problem. Please check your internet connection and try again.');
    } else {
      callAppendTranscript('ai',
        'There was a problem with the microphone. Please tap Speak again.');
    }
  };

  rec.onend = function () {
    _micListening = false;
    callSetMicUI(false);
    if (_callActive && !_aiSpeaking) callSetStatus('Connected');
  };

  return rec;
}

/* ───────────────────────────────────────────────────────────
   RINGTONE & CALL SETUP
─────────────────────────────────────────────────────────── */

/** Generate and play a phone ringtone (truu truu...) */
function callPlayRingtone(duration) {
  try {
    var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    
    osc.start(audioCtx.currentTime);
    
    // Ring pattern: 500ms on, 500ms off, repeat
    var startTime = audioCtx.currentTime;
    var ringDuration = duration || 3000;
    var ringEndTime = startTime + (ringDuration / 1000);
    var pattern = 0.5; // 500ms
    
    for (var t = startTime; t < ringEndTime; t += pattern * 2) {
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.setValueAtTime(0, t + pattern);
    }
    
    osc.stop(ringEndTime);
    _ringingOscillator = osc;
  } catch (e) {
    console.warn('[CallAI] Ringtone generation failed:', e);
  }
}

function callStopRingtone() {
  try {
    if (_ringingOscillator) {
      _ringingOscillator.stop();
      _ringingOscillator = null;
    }
  } catch (e) {
    console.warn('[CallAI] Failed to stop ringtone:', e);
  }
}

/** Detect if speech contains digit "1" or "2" or language keywords */
function callDetectLanguageInput(transcript) {
  var lower = transcript.toLowerCase().trim();
  if (lower.includes('2') || lower.includes('two') || lower.includes('english') || lower.includes('english please')) {
    return 'en-IN';
  } else if (lower.includes('1') || lower.includes('one') || lower.includes('hindi') || lower.includes('hindi please')) {
    return 'hi-IN';
  }
  return null;
}

/* ───────────────────────────────────────────────────────────
   CALL FLOW MANAGEMENT
─────────────────────────────────────────────────────────── */

function callProcessStage(userText) {
  if (_callStage === 'language' && userText) {
    var detected = callDetectLanguageInput(userText);
    if (detected) {
      _userLanguage = detected;
      callAppendTranscript('user', userText);
      
      var thankyouMsg = (_userLanguage === 'hi-IN') 
        ? 'Dhanyavaad.'
        : 'Thank you.';
      
      callAppendTranscript('ai', thankyouMsg);
      callSpeakWhenReady(thankyouMsg, function() {
        if (!_callActive) return;
        _callStage = 'complaint';
        
        // Ask for complaint details
        var askMsg = (_userLanguage === 'hi-IN')
          ? 'Kripya apni shikayat batayein.'
          : 'Please tell me your complaint.';
        
        callAppendTranscript('ai', askMsg);
        callSpeakWhenReady(askMsg, function() {
          if (!_callActive) return;
          // Start listening for complaint
          _recognition = callMakeRecognition();
          if (_recognition) {
            try { _recognition.start(); } catch (e) { console.warn('[CallAI] Start listen failed', e); }
          }
        });
      });
    }
  } 
  else if (_callStage === 'complaint' && userText) {
    callAppendTranscript('user', userText);
    callSetStatus('Processing complaint...');
    
    // Directly respond with success message
    var reply = (_userLanguage === 'hi-IN')
      ? 'Aapki shikayat safal tarike se register ho gayi hai. Dhanyavaad.'
      : 'Your complaint has been registered successfully. Thank you.';
    
    callAppendTranscript('ai', reply);
    callSpeakWhenReady(reply, function() {
      if (!_callActive) return;
      callCompleteCall();
    });
  }
}

function callCompleteCall() {
  _callStage = 'closing';
  
  // End call after a short delay
  setTimeout(endCall, 2000);
}


function callSelectLanguage(lang) {
  _userLanguage = lang;
  var btns = document.querySelectorAll('.call-voice-option[data-lang]');
  btns.forEach(function(btn) { btn.classList.remove('selected'); });
  document.querySelector('[data-lang="' + lang + '"]').classList.add('selected');
}

function callPopulateVoiceOptions() {
  var container = callEl('callVoiceOptions');
  if (!container) return;
  container.innerHTML = '';

  var voices = window.speechSynthesis.getVoices();
  var filteredVoices = voices.filter(function(v) {
    return v.lang === _userLanguage || v.lang.startsWith(_userLanguage.split('-')[0]);
  });

  if (filteredVoices.length === 0) {
    // Fallback: show some generic voices
    filteredVoices = voices.slice(0, 3);
  }

  filteredVoices.slice(0, 4).forEach(function(voice, idx) {
    var btn = document.createElement('button');
    btn.className = 'call-voice-option';
    btn.textContent = (idx === 0 ? '✓ ' : '') + (voice.name || 'Voice ' + (idx + 1));
    btn.style.cssText = 'display:block; width:100%; padding:12px 14px; background:var(--bg-dark); border:1px solid var(--border-color); border-radius:10px; color:var(--text-primary); cursor:pointer; text-align:left; margin-bottom:8px;';
    if (idx === 0) {
      btn.classList.add('selected');
      btn.style.background = 'linear-gradient(135deg, var(--primary), var(--primary-light))';
      btn.style.color = '#071020';
      btn.style.fontWeight = '700';
    }
    btn.onclick = function() {
      document.querySelectorAll('#callVoiceOptions .call-voice-option').forEach(function(b) {
        b.classList.remove('selected');
        b.style.background = 'var(--bg-dark)';
        b.style.color = 'var(--text-primary)';
        b.style.fontWeight = '400';
      });
      btn.classList.add('selected');
      btn.style.background = 'linear-gradient(135deg, var(--primary), var(--primary-light))';
      btn.style.color = '#071020';
      btn.style.fontWeight = '700';
      _selectedVoice = voice;
    };
    _selectedVoice = voice; // Set default
    container.appendChild(btn);
  });
}

function callStartConversation() {
  var nameInput = callEl('callUserName');
  if (!nameInput || !nameInput.value.trim()) {
    alert('Please enter your name');
    return;
  }
  _userName = nameInput.value.trim();

  // Hide name modal, show main call UI
  var nameModal = callEl('callNameModal');
  if (nameModal) nameModal.style.display = 'none';
  
  var mainContent = callEl('callMainContent');
  var waveform = callEl('callWaveform');
  var transcript = callEl('callTranscriptPanel');
  var micStatus = callEl('callMicStatus');
  var controls = callEl('callCtrlPanel');
  var duration = callEl('callDuration');

  if (mainContent) mainContent.style.display = 'flex';
  if (waveform) waveform.style.display = 'flex';
  if (transcript) transcript.style.display = 'block';
  if (micStatus) micStatus.style.display = 'flex';
  if (controls) controls.style.display = 'flex';
  if (duration) duration.style.display = 'block';

  callSetStatus('Ringing...');
  
  // Play ringtone for 3 seconds
  callPlayRingtone(3000);
  
  // After ringtone, start language selection
  setTimeout(function() {
    if (!_callActive) return;
    callStopRingtone();
    callSetStatus('Connected');
    callStartTimer();
    
    // Language selection
    _callStage = 'language';
    var langMsg = 'Press 2 for English, press 1 for Hindi.';
    callAppendTranscript('ai', langMsg);
    callSpeakWhenReady(langMsg, function() {
      if (!_callActive) return;
      // Start listening for language selection
      _recognition = callMakeRecognition();
      if (_recognition) {
        try { _recognition.start(); } catch (e) { console.warn('[CallAI] Start listen failed', e); }
      }
    });
  }, 3100);
}

/* Save call transcript to localStorage */
function callSaveTranscript() {
  try {
    var callRecord = {
      timestamp: new Date().toISOString(),
      duration: callEl('callDuration') ? callEl('callDuration').textContent : '00:00',
      userName: _userName,
      language: _userLanguage,
      transcript: _callHistory
    };

    var callHistory = JSON.parse(localStorage.getItem('callHistory') || '[]');
    callHistory.push(callRecord);
    localStorage.setItem('callHistory', JSON.stringify(callHistory));
    console.log('[CallAI] Transcript saved:', callRecord);
  } catch (e) {
    console.warn('[CallAI] Failed to save transcript:', e);
  }
}

/* ───────────────────────────────────────────────────────────
   PUBLIC API  (called from HTML onclick="...")
─────────────────────────────────────────────────────────── */

/** Opens the call screen and initiates the AI greeting */
function openCallScreen() {
  var overlay = callEl('aiCallOverlay');
  if (!overlay) { console.error('[CallAI] Overlay element #aiCallOverlay not found!'); return; }

  // Reset everything
  _callActive    = false;   // will be set true after setup
  _micListening  = false;
  _aiSpeaking    = false;
  _callHistory   = [];
  _userName      = '';
  _userLanguage  = 'en-IN';
  _selectedVoice = null;
  _callStage     = 'greeting';

  window.speechSynthesis.cancel();
  callStopRingtone();
  if (_recognition) { try { _recognition.stop(); } catch (_) {} _recognition = null; }

  // Clear UI
  var transcript = callEl('callTranscript');
  if (transcript) transcript.innerHTML = '';
  var dur = callEl('callDuration');
  if (dur) dur.textContent = '00:00';

  callSetStatus('Connecting…');
  callSetMicUI(false);
  callSetAvatarSpeaking(false);
  callSetWaveform(false);

  // Show the overlay
  overlay.style.removeProperty('display');
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  // Hide all modals and main content first
  var nameModal = callEl('callNameModal');
  var voiceModal = callEl('callVoiceModal');
  var mainContent = callEl('callMainContent');
  var waveform = callEl('callWaveform');
  var transcriptPanel = callEl('callTranscriptPanel');
  var micStatus = callEl('callMicStatus');
  var controls = callEl('callCtrlPanel');
  var duration = callEl('callDuration');

  if (nameModal) nameModal.style.display = 'none';
  if (voiceModal) voiceModal.style.display = 'none';
  if (mainContent) mainContent.style.display = 'none';
  if (waveform) waveform.style.display = 'none';
  if (transcriptPanel) transcriptPanel.style.display = 'none';
  if (micStatus) micStatus.style.display = 'none';
  if (controls) controls.style.display = 'none';
  if (duration) duration.style.display = 'none';

  _callActive = true;

  // Show name capture modal now that call is active
  if (nameModal) { nameModal.style.display = 'flex'; callEl('callUserName').focus(); }

  // Add keyboard listener
  _keyListener = handleKeyPress;
  document.addEventListener('keydown', _keyListener);
}

/** Toggles microphone — start listening or stop listening */
async function toggleCallMic() {
  if (!_callActive) return;

  // If AI is speaking, interrupt it first
  if (_aiSpeaking) {
    window.speechSynthesis.cancel();
    _aiSpeaking = false;
    callSetAvatarSpeaking(false);
    callSetWaveform(false);
  }

  if (_micListening) {
    // Stop mic
    if (_recognition) { try { _recognition.stop(); } catch (_) {} }
    _micListening = false;
    callSetMicUI(false);
    callSetStatus('Connected');
  } else {
    var allowed = await ensureMicrophoneAccess();
    if (!allowed) {
      alert('Microphone access is needed for voice input. Please allow the microphone and try again.');
      callAppendTranscript('ai', 'Microphone access is required to hear your complaint. Please allow mic permissions.');
      return;
    }

    // Start mic — always create a fresh instance to avoid state bugs
    _recognition = callMakeRecognition();
    if (!_recognition) {
      alert('Speech Recognition is not supported in this browser. Please use Chrome or Edge.');
      return;
    }
    try {
      _recognition.start();
    } catch (e) {
      console.warn('[CallAI] Recognition start error:', e);
      // Try once more after short delay
      setTimeout(function () {
        _recognition = callMakeRecognition();
        if (_recognition) { try { _recognition.start(); } catch (_) {} }
      }, 300);
    }
  }
}

/** Ends the call and hides the overlay */
function endCall() {
  _callActive = false;

  // Save transcript before ending
  if (_callHistory.length > 0) {
    callSaveTranscript();
  }

  window.speechSynthesis.cancel();
  if (_recognition) { try { _recognition.stop(); } catch (_) {} _recognition = null; }
  _micListening = false;
  _aiSpeaking   = false;

  callStopTimer();

  var overlay = callEl('aiCallOverlay');
  if (overlay) {
    overlay.style.transition = 'opacity 0.35s ease';
    overlay.style.opacity    = '0';
    setTimeout(function () {
      overlay.style.display    = 'none';
      overlay.style.opacity    = '';
      overlay.style.transition = '';
    }, 370);
  }

  // Remove keyboard listener
  if (_keyListener) {
    document.removeEventListener('keydown', _keyListener);
    _keyListener = null;
  }
}
