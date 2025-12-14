tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
  LayoutAnimation,
  Platform,
  UIManager,
  Dimensions,
  ImageBackground,
} from 'react-native';
import { Mic, BookOpen, StopCircle, Play } from 'lucide-react-native';
import Voice, { SpeechResultsEvent, SpeechErrorEvent } from '@react-native-voice/voice';
import * as Speech from 'expo-speech';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useAuth } from '@/lib/authContext';
import { TypewriterText } from '@/components/TypewriterText';
import { calculateEggProgress, getEggImage } from '@/lib/eggUtils';
import { useRouter } from 'expo-router';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;

export default function ReadingScreen() {
  const { user } = useAuth();
  const router = useRouter();

  // --- VIDEO SETUP ---
  const player = useVideoPlayer(require('../../assets/images/guide/guide_talking.mp4'), player => {
    player.loop = true;
  });

  // --- VIDEO SETUP (TRANSITION) ---
  const transitionPlayer = useVideoPlayer(require('../../assets/videos/egg_transition.mp4'), player => {
    player.loop = false;
  });

  // --- STATE ---
  const [bookTitle, setBookTitle] = useState('');
  const [isReadingSessionActive, setIsReadingSessionActive] = useState(false);
  const [guideMessage, setGuideMessage] = useState("Welcome! Tell me what you are reading.");
  const [isGuideSpeaking, setIsGuideSpeaking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isPaused, setIsPaused] = useState(false);
  const [showTransition, setShowTransition] = useState(false);

  // --- REFS ---
  const isSessionActiveRef = useRef(false);
  const isPausedRef = useRef(false);
  const processingTitleRef = useRef(false);
  const inputRef = useRef<TextInput>(null);
  const currentTextRef = useRef("");
  const currentStageRef = useRef(0);

  // --- PROGRESS STATE ---
  const [readingSeconds, setReadingSeconds] = useState(0);
  const [currentProgress, setCurrentProgress] = useState(0);
  const currentThemeId = 1;

  useEffect(() => { isSessionActiveRef.current = isReadingSessionActive; }, [isReadingSessionActive]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

  // --- TRANSITION LOGIC ---
  useEffect(() => {
    let newStage = 0;
    if (currentProgress >= 100) newStage = 3;
    else if (currentProgress >= 80) newStage = 2;
    else if (currentProgress >= 20) newStage = 1;

    if (newStage > currentStageRef.current && isReadingSessionActive) {
        triggerTransition();
        currentStageRef.current = newStage;
    }
  }, [currentProgress, isReadingSessionActive]);

  const triggerTransition = () => {
      const wasRecording = isRecording;
      if (wasRecording) {
          try { Voice.stop(); setIsRecording(false); } catch(e){}
      }
      
      setShowTransition(true);
      try {
          transitionPlayer.currentTime = 0;
          transitionPlayer.play();
      } catch(e) {}

      setTimeout(() => {
          setShowTransition(false);
          if (wasRecording && !isPaused) {
              try { Voice.start('en-US'); setIsRecording(true); } catch(e){}
          }
          if (currentStageRef.current === 3) {
              setGuideMessage("It's hatching! Look at that!");
          }
      }, 3500);
  };

  // --- SPEECH SETUP ---
  useEffect(() => {
    const onSpeechStart = () => {
      console.log('Speech Started');
      setIsRecording(true);
      currentTextRef.current = "";
    };

    const onSpeechEnd = () => {
      console.log('Speech Ended');
      setIsRecording(false);

      if (isSessionActiveRef.current && !isPausedRef.current && !processingTitleRef.current && !showTransition) {
        setTimeout(() => {
          if (isSessionActiveRef.current && !isPausedRef.current && !processingTitleRef.current && !showTransition) {
            try { Voice.start('en-US'); } catch (e) {}
          }
        }, 500);
      }
    };

    const onSpeechResults = (e: SpeechResultsEvent) => {
      if (e.value && e.value.length > 0) {
        const text = e.value[0];
        if (isSessionActiveRef.current) setTranscript(text);
        processSpeech(text, true);
      }
    };

    const onSpeechPartialResults = (e: SpeechResultsEvent) => {
      if (e.value && e.value.length > 0) {
        const text = e.value[0];
        if (isSessionActiveRef.current) setTranscript(text);
        processSpeech(text, false);
      }
    };

    const onSpeechError = (e: SpeechErrorEvent) => {
      if (processingTitleRef.current || showTransition) return;

      console.log('Speech Error:', e.error);
      setIsRecording(false);

      if (!isSessionActiveRef.current && isPausedRef.current) return;

      if (!isSessionActiveRef.current && currentTextRef.current.length > 2) {
        let recoveredTitle = currentTextRef.current;
        if (recoveredTitle.toLowerCase().includes('reading')) {
          const parts = recoveredTitle.split(/reading/i);
          if (parts.length > 1) recoveredTitle = parts[1].trim();
        }
        if (recoveredTitle.length > 0) {
          commitTitle(recoveredTitle.replace(/[.,!?;:]/g, ""));
          return;
        }
      }

      const silence = e.error?.message?.includes('7') || e.error?.message?.includes('6');
      if (silence && isSessionActiveRef.current && !isPausedRef.current) {
        setTimeout(() => {
          try { Voice.start('en-US'); } catch (e) {}
        }, 500);
      }
    };

    Voice.onSpeechStart = onSpeechStart;
    Voice.onSpeechEnd = onSpeechEnd;
    Voice.onSpeechResults = onSpeechResults;
    Voice.onSpeechPartialResults = onSpeechPartialResults;
    Voice.onSpeechError = onSpeechError;

    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, [showTransition]);

  // --- TIMER LOGIC ---
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isReadingSessionActive && !isPaused && !showTransition) {
      interval = setInterval(() => {
        setReadingSeconds(prev => {
          const newSec = prev + 1;
          const minutes = newSec / 60;
          setCurrentProgress(calculateEggProgress(minutes));
          return newSec;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isReadingSessionActive, isPaused, showTransition]);

  // --- DRAGON SPEAKING ---
  useEffect(() => {
    if (guideMessage === "I'm listening..." || guideMessage === "Listening..." || showTransition) return;

    const speak = async () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      await Speech.stop();
      setIsGuideSpeaking(true);
      try { player.play(); } catch(e) {}

      Speech.speak(guideMessage, {
        language: 'en-US',
        pitch: 0.9,
        rate: 0.9,
        onDone: finishSpeaking,
        onStopped: finishSpeaking,
      });
    };

    if (guideMessage) speak();
  }, [guideMessage]);

  const finishSpeaking = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsGuideSpeaking(false);
    try {
      player.pause();
      player.seekBy(-100);
    } catch (e) {}
  };

  // --- HANDLE SPEECH LOGIC ---
  const processSpeech = (text: string, isFinal: boolean) => {
    if (processingTitleRef.current) return;

    const lower = text.toLowerCase();
    currentTextRef.current = text;

    if (!isSessionActiveRef.current) {
      let detected = "";
      let commit = false;

      if (lower.includes('reading')) {
        const parts = text.split(/reading/i);
        if (parts.length > 1) {
          detected = parts[1].trim().replace(/[.,!?;:]/g, "");
          commit = isFinal;
        }
      } else if (lower.length > 2 && !lower.includes("listening")) {
        detected = text;
        commit = isFinal;
      }

      if (detected.length > 0) {
        if (inputRef.current) inputRef.current.setNativeProps({ text: detected });
        setBookTitle(detected);
      }

      if (commit && detected.length > 0) {
        commitTitle(detected);
      }
    }
  };

  const commitTitle = (title: string) => {
    if (processingTitleRef.current) return;
    processingTitleRef.current = true;
    currentTextRef.current = "";

    console.log("Committing Title:", title);
    setBookTitle(title);
    setTranscript("");
    setGuideMessage(`Ooh! ${title}? I love that book!`);

    try { Voice.stop(); } catch (e) {}
    setIsRecording(false);

    setTimeout(() => {
      setIsReadingSessionActive(true);
      setGuideMessage("Okay, I'm listening! Start reading whenever you're ready.");
      processingTitleRef.current = false;
    }, 4000);
  };

  const handleManualStart = () => {
    if (!bookTitle) {
      Alert.alert("Missing Info", "Please tell me the name of the book first!");
      return;
    }
    setIsReadingSessionActive(true);
    setIsPaused(false);
    setGuideMessage("Okay, I'm listening! Start reading whenever you're ready.");

    setTimeout(() => toggleListening(), 1500);
  };

  const finishSession = () => {
    setIsReadingSessionActive(false);
    setIsPaused(true);
    try { Voice.stop(); Voice.removeAllListeners(); } catch(e) {}
    Speech.stop();
    setGuideMessage("You did amazing! Progress saved.");

    setTimeout(() => {
      router.replace('/(tabs)');
    }, 1500);
  };

  const toggleListening = async () => {
    if (!isPaused && isReadingSessionActive) {
      setIsPaused(true);
      try {
        await Voice.stop();
        setIsRecording(false);
        setGuideMessage("Paused. Tap mic to resume.");
      } catch (e) {}
    } else {
      setIsPaused(false);
      setGuideMessage(isReadingSessionActive ? "Listening..." : "I'm listening...");

      try {
        setTranscript("");
        await Speech.stop();
        await Voice.start('en-US');
        setIsRecording(true);
      } catch (e) {
        Alert.alert("Error", "Could not start listening.");
      }
    }
  };

  const eggImage = getEggImage(currentThemeId, currentProgress);
  const dragonContainerStyle = isGuideSpeaking ? styles.dragonMaximized : styles.dragonMinimized;

  // --- BACKGROUND SELECTION ---
  const bgImage = isReadingSessionActive
    ? require('../../assets/images/cottage_bg.png')
    : require('../../assets/images/library_bg.png');

  return (
    <ImageBackground
      source={bgImage}
      style={styles.mainContainer}
      resizeMode="cover"
    >
      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>

        {/* --- TOP: BOOK INPUT (Visible in both states) --- */}
        <View style={styles.parchmentCard}>
          <Text style={styles.parchmentLabel}>I am reading:</Text>
          <TextInput
            ref={inputRef}
            style={styles.parchmentInput}
            placeholder="Book Title"
            placeholderTextColor="#8B4513"
            value={bookTitle}
            onChangeText={setBookTitle}
            editable={!isReadingSessionActive}
          />
          {(isRecording || transcript.length > 0) && (
            <View style={styles.speechFeedback}>
              {isRecording && <ActivityIndicator color="#8B4513" size="small" />}
              <Text style={styles.transcriptText}>{transcript}</Text>
            </View>
          )}
        </View>

        {/* --- PROGRESS CARD (Appears below title when active) --- */}
        {isReadingSessionActive && (
          <View style={styles.cottageProgressCard}>
            <View style={styles.progressHeader}>
              <Text style={styles.cottageTitle}>Hatching Progress</Text>
              <Text style={styles.cottagePercent}>{Math.floor(currentProgress)}%</Text>
            </View>

            <View style={styles.cottageBarBg}>
              <View style={[styles.cottageBarFill, { width: `${currentProgress}%` }]} />
            </View>

            <Text style={styles.cottageStatusText}>
                {currentProgress < 20 ? "The egg is warming up..." :
                 currentProgress < 80 ? "I see it wobbling!" : "It's almost here!"}
            </Text>
          </View>
        )}

      </ScrollView>

      {/* --- SCENE: THE BIG EGG (Visible only during Active Reading) --- */}
      {isReadingSessionActive && (
        <View style={styles.sceneContainer}>
            <Image
              source={eggImage}
              style={styles.sceneEgg}
              resizeMode="contain"
            />
        </View>
      )}

      {/* --- CONTROLS SIDEBAR --- */}
      <View style={styles.controlsSidebar}>
          {isReadingSessionActive ? (
            <>
                <View style={styles.timerBadge}>
                    <Text style={styles.timerText}>{Math.floor(readingSeconds / 60)}m {readingSeconds % 60}s</Text>
                </View>

                <TouchableOpacity
                    style={[styles.micButton, !isPaused && styles.micActive]}
                    onPress={toggleListening}
                >
                    {!isPaused ? <StopCircle color="#FFF" size={32} /> : <Mic color="#FFF" size={32} />}
                </TouchableOpacity>

                <TouchableOpacity style={styles.finishButton} onPress={finishSession}>
                    <Text style={styles.finishButtonText}>Finish</Text>
                </TouchableOpacity>
            </>
          ) : (
            <>
                <TouchableOpacity
                    style={[styles.micButton, isRecording && styles.micActive]}
                    onPress={toggleListening}
                >
                    {isRecording ? <StopCircle color="#FFF" size={32} /> : <Mic color="#FFF" size={32} />}
                </TouchableOpacity>

                <TouchableOpacity style={styles.startButton} onPress={handleManualStart}>
                    <Text style={styles.startButtonText}>Start</Text>
                </TouchableOpacity>
            </>
          )}
      </View>

      {/* --- TRANSITION OVERLAY --- */}
      {showTransition && (
          <View style={styles.transitionOverlay}>
              <VideoView
                  player={transitionPlayer}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                  nativeControls={false}
              />
          </View>
      )}

      {/* --- GUIDE (Dragon) --- */}
      {!showTransition && (
        <View style={[styles.dragonContainer, dragonContainerStyle]}>
            {isGuideSpeaking && <View style={styles.backdrop} />}
            {isGuideSpeaking && (
            <View style={styles.bubble}>
                <TypewriterText text={guideMessage} speed={40} />
                <View style={styles.bubbleArrow} />
            </View>
            )}
            <View style={isGuideSpeaking ? styles.mediaMaximized : styles.mediaMinimized}>
            {isGuideSpeaking ? (
                <VideoView
                player={player}
                style={{ width: '100%', height: '100%' }}
                contentFit="contain"
                nativeControls={false}
                />
            ) : (
                <Image
                source={require('../../assets/images/guide/guide_idle.png')}
                style={{ width: '100%', height: '100%' }}
                resizeMode="contain"
                />
            )}
            </View>
        </View>
      )}
    </ImageBackground>
  );
}

// ---------------- STYLES ------------------

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#000' },
  scrollContainer: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 180, paddingBottom: 250 },

  // --- DRAGON (GUIDE) STYLES ---
  dragonContainer: { position: 'absolute', zIndex: 100, justifyContent: 'center', alignItems: 'center' },
  dragonMinimized: {
    top: 50,
    left: 20,
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'white',
    borderWidth: 3,
    borderColor: '#FFB6D9',
    overflow: 'hidden',
    elevation: 5
  },
  mediaMinimized: { width: '100%', height: '100%' },
  dragonMaximized: { top: 0, left: 0, width: SCREEN_WIDTH, height: SCREEN_HEIGHT, justifyContent: 'center', alignItems: 'center' },
  mediaMaximized: { width: 300, height: 300, marginTop: 20 },

  // --- TRANSITION OVERLAY ---
  transitionOverlay: {
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 200,
      backgroundColor: 'black',
  },

  // --- UNIFIED PARCHMENT CARD STYLE ---
  parchmentCard: {
    backgroundColor: '#FDF5E6', // Old Lace
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    borderWidth: 3,
    borderColor: '#8B4513', // SaddleBrown
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  
  cottageProgressCard: {
    backgroundColor: '#FDF5E6',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    borderWidth: 3,
    borderColor: '#8B4513',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },

  cottageTitle: { fontSize: 16, fontWeight: 'bold', color: '#5D4037' },
  cottagePercent: { fontSize: 16, fontWeight: 'bold', color: '#8B4513' },
  parchmentLabel: { fontSize: 14, fontWeight: 'bold', color: '#5D4037', marginBottom: 4 },
  cottageStatusText: { marginTop: 4, fontSize: 12, color: '#5D4037', fontStyle: 'italic', textAlign: 'center' },

  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  cottageBarBg: {
    height: 12,
    backgroundColor: '#DEB887',
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#5D4037'
  },
  cottageBarFill: { height: '100%', backgroundColor: '#32CD32' },

  parchmentInput: {
    borderBottomWidth: 2,
    borderBottomColor: '#8B4513',
    fontSize: 16,
    color: '#3E2723',
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },

  // --- THE BIG EGG SCENE ---
  sceneContainer: {
    position: 'absolute',
    bottom: '5%',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  sceneEgg: {
    width: 200,
    height: 220,
  },

  // --- CONTROLS SIDEBAR ---
  controlsSidebar: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    alignItems: 'center',
    gap: 15,
    zIndex: 20,
  },
  micButton: {
    backgroundColor: '#FF69B4',
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    borderWidth: 2,
    borderColor: '#FFF'
  },
  micActive: { backgroundColor: '#FF1493', transform: [{ scale: 1.1 }] },

  startButton: {
    backgroundColor: 'white',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#FF69B4',
    elevation: 3
  },
  startButtonText: { color: '#FF69B4', fontWeight: 'bold', fontSize: 12 },

  finishButton: {
    backgroundColor: '#FF4444',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 15,
    marginTop: 5
  },
  finishButtonText: { color: 'white', fontWeight: 'bold', fontSize: 12 },

  timerBadge: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    marginBottom: 5,
  },
  timerText: { color: 'white', fontWeight: 'bold', fontFamily: 'monospace' },

  // --- MISC ---
  speechFeedback: { marginTop: 8, flexDirection: 'row', alignItems: 'center' },
  transcriptText: { flex: 1, color: '#8B4513', fontStyle: 'italic', fontSize: 12, marginLeft: 5 },

  // Dragon Dialog
  backdrop: { position: 'absolute', width: '100%', height: '100%', backgroundColor: 'rgba(255, 240, 245, 0.95)' },
  bubble: { backgroundColor: '#FFF', padding: 20, borderRadius: 20, width: '85%', minHeight: 100, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#FFB6D9', elevation: 10 },
  bubbleArrow: { position: 'absolute', bottom: -15, alignSelf: 'center', width: 0, height: 0, borderLeftWidth: 15, borderRightWidth: 15, borderTopWidth: 15, borderStyle: 'solid', backgroundColor: 'transparent', borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#FFB6D9' },
});
