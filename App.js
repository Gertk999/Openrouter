import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  Image,
  StyleSheet,
  StatusBar,
  Alert,
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { startOpenRouterLogin, finishOpenRouterLogin, getStoredKey, logout } from './lib/auth';
import { fetchModels, sendChat, sendChatMulti } from './lib/openrouter';
import {
  COMPARE_COLORS,
  COMPARE_MODEL_CAP,
  sortModelsByName,
  buildMessageContent,
  toggleModelSelection,
} from './lib/utils';

const DEFAULT_MODEL = 'anthropic/claude-sonnet-5';

export default function App() {
  const [apiKey, setApiKey] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState(null);

  const [awaitingCode, setAwaitingCode] = useState(false);
  const [pastedCode, setPastedCode] = useState('');

  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const [pickerVisible, setPickerVisible] = useState(false);

  // Compare mode: when compareModels has 2+ entries, sends fan out to all of them
  // and responses render as colored side-by-side/stacked cards instead of a
  // single assistant bubble.
  const [compareMode, setCompareMode] = useState(false);
  const [comparePickerVisible, setComparePickerVisible] = useState(false);
  const [compareModels, setCompareModels] = useState([]);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    (async () => {
      const stored = await getStoredKey();
      if (stored) setApiKey(stored);
      setCheckingSession(false);
    })();
  }, []);

  useEffect(() => {
    if (!apiKey) return;
    fetchModels(apiKey)
      .then((m) => setModels(sortModelsByName(m)))
      .catch((e) => console.warn('model fetch failed', e.message));
  }, [apiKey]);

  const handleLogin = useCallback(async () => {
    setLoginError(null);
    setLoggingIn(true);
    try {
      await startOpenRouterLogin();
      setAwaitingCode(true);
    } catch (e) {
      setLoginError(e.message);
    } finally {
      setLoggingIn(false);
    }
  }, []);

  const handleSubmitCode = useCallback(async () => {
    setLoginError(null);
    setLoggingIn(true);
    try {
      const key = await finishOpenRouterLogin(pastedCode);
      setApiKey(key);
      setAwaitingCode(false);
      setPastedCode('');
    } catch (e) {
      setLoginError(e.message);
    } finally {
      setLoggingIn(false);
    }
  }, [pastedCode]);

  const handleLogout = useCallback(async () => {
    await logout();
    setApiKey(null);
    setMessages([]);
  }, []);

  const handlePickImage = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to attach an image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.7,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const mime = asset.mimeType || 'image/jpeg';
    const uri = asset.base64 ? `data:${mime};base64,${asset.base64}` : asset.uri;
    setAttachments((prev) => [...prev, { type: 'image', uri, name: asset.fileName || 'photo.jpg' }]);
  }, []);

  const handlePickFile = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'text/*',
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    try {
      const content = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'utf8' });
      setAttachments((prev) => [...prev, { type: 'file', name: asset.name, content }]);
    } catch (e) {
      Alert.alert('Could not read file', 'Only plain text files are supported right now.');
    }
  }, []);

  const removeAttachment = useCallback((index) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if ((!text && attachments.length === 0) || sending) return;
    const content = buildMessageContent(text, attachments);
    const userMsg = { id: Date.now() + '-u', role: 'user', content, displayText: text, attachments };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setAttachments([]);
    setSending(true);
    try {
      if (compareMode && compareModels.length >= 2) {
        const results = await sendChatMulti(apiKey, compareModels, nextMessages);
        setMessages((prev) => [
          ...prev,
          { id: Date.now() + '-cmp', role: 'compare', results },
        ]);
      } else {
        const reply = await sendChat(apiKey, selectedModel, nextMessages);
        setMessages((prev) => [...prev, { id: Date.now() + '-a', role: 'assistant', content: reply }]);
      }
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + '-e', role: 'error', content: e.message },
      ]);
    } finally {
      setSending(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [input, attachments, sending, messages, apiKey, selectedModel, compareMode, compareModels]);

  const handleToggleCompareModel = useCallback((modelId) => {
    setCompareModels((prev) => toggleModelSelection(prev, modelId, COMPARE_MODEL_CAP));
  }, []);

  if (checkingSession) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color="#fff" />
      </SafeAreaView>
    );
  }

  if (!apiKey) {
    return (
      <SafeAreaView style={styles.center}>
        <ExpoStatusBar style="light" />
        <Text style={styles.logo}>OpenRouter Chat</Text>
        <Text style={styles.subtitle}>Sign in with your own OpenRouter account.{'\n'}No backend — your key stays on this device.</Text>
        {!awaitingCode ? (
          <TouchableOpacity style={styles.loginButton} onPress={handleLogin} disabled={loggingIn}>
            {loggingIn ? <ActivityIndicator color="#000" /> : <Text style={styles.loginButtonText}>Continue with OpenRouter</Text>}
          </TouchableOpacity>
        ) : (
          <>
            <Text style={[styles.subtitle, { marginTop: 8 }]}>
              A browser tab opened. Log in, approve the app, then copy the code OpenRouter shows on screen and paste it below.
            </Text>
            <TextInput
              style={styles.codeInput}
              placeholder="Paste authorization code"
              placeholderTextColor="#666"
              autoCapitalize="none"
              autoCorrect={false}
              value={pastedCode}
              onChangeText={setPastedCode}
            />
            <TouchableOpacity style={styles.loginButton} onPress={handleSubmitCode} disabled={loggingIn}>
              {loggingIn ? <ActivityIndicator color="#000" /> : <Text style={styles.loginButtonText}>Submit code</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setAwaitingCode(false); setPastedCode(''); }}>
              <Text style={[styles.subtitle, { marginTop: 12, textDecorationLine: 'underline' }]}>Start over</Text>
            </TouchableOpacity>
          </>
        )}
        {loginError ? <Text style={styles.errorText}>{loginError}</Text> : null}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <ExpoStatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.modelPicker} onPress={() => setPickerVisible(true)}>
          <Text style={styles.modelPickerText} numberOfLines={1}>{selectedModel}</Text>
          <Text style={styles.chevron}>▾</Text>
        </TouchableOpacity>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={[styles.compareButton, compareMode && styles.compareButtonActive]}
            onPress={() => {
              if (!compareMode) {
                setComparePickerVisible(true);
              } else {
                setCompareMode(false);
                setCompareModels([]);
              }
            }}
          >
            <Text style={[styles.compareButtonText, compareMode && styles.compareButtonTextActive]}>
              {compareMode ? `Comparing (${compareModels.length})` : 'Compare'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout}>
            <Text style={styles.logoutText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.messageList}
        renderItem={({ item }) => {
          if (item.role === 'compare') {
            return (
              <View style={styles.compareRow}>
                {item.results.map((r, i) => (
                  <View key={r.model} style={[styles.compareCard, { borderColor: COMPARE_COLORS[i % COMPARE_COLORS.length] }]}>
                    <Text style={[styles.compareModelLabel, { color: COMPARE_COLORS[i % COMPARE_COLORS.length] }]} numberOfLines={1}>
                      {r.model}
                    </Text>
                    <Text style={styles.compareCardText}>
                      {r.error ? `Error: ${r.error}` : r.content}
                    </Text>
                  </View>
                ))}
              </View>
            );
          }
          return (
            <View
              style={[
                styles.bubble,
                item.role === 'user' ? styles.userBubble : styles.assistantBubble,
                item.role === 'error' && styles.errorBubble,
              ]}
            >
              {item.attachments && item.attachments.some((a) => a.type === 'image') && (
                <View style={styles.attachmentPreviewRow}>
                  {item.attachments.filter((a) => a.type === 'image').map((a, i) => (
                    <Image key={i} source={{ uri: a.uri }} style={styles.attachmentThumb} />
                  ))}
                </View>
              )}
              <Text style={styles.bubbleText}>{item.displayText ?? item.content}</Text>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>Ask anything.</Text>
          </View>
        }
      />

      {sending && (
        <View style={styles.typingRow}>
          <ActivityIndicator color="#8e8e93" size="small" />
          <Text style={styles.typingText}>Thinking…</Text>
        </View>
      )}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {attachments.length > 0 && (
          <ScrollView horizontal style={styles.attachmentBar} showsHorizontalScrollIndicator={false}>
            {attachments.map((a, i) => (
              <TouchableOpacity key={i} style={styles.attachmentChip} onPress={() => removeAttachment(i)}>
                {a.type === 'image' ? (
                  <Image source={{ uri: a.uri }} style={styles.attachmentChipThumb} />
                ) : (
                  <Text style={styles.attachmentChipText} numberOfLines={1}>📄 {a.name}</Text>
                )}
                <Text style={styles.attachmentChipRemove}>✕</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        <View style={styles.inputRow}>
          <TouchableOpacity style={styles.attachButton} onPress={handlePickImage}>
            <Text style={styles.attachButtonText}>📷</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachButton} onPress={handlePickFile}>
            <Text style={styles.attachButtonText}>📎</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Message..."
            placeholderTextColor="#8e8e93"
            multiline
          />
          <TouchableOpacity
            style={styles.sendButton}
            onPress={handleSend}
            disabled={sending || (!input.trim() && attachments.length === 0)}
          >
            <Text style={styles.sendButtonText}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={pickerVisible} animationType="slide" transparent onRequestClose={() => setPickerVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setPickerVisible(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Choose a model</Text>
            <FlatList
              data={models.length ? models : [{ id: DEFAULT_MODEL, name: DEFAULT_MODEL }]}
              keyExtractor={(m) => m.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modelRow}
                  onPress={() => {
                    setSelectedModel(item.id);
                    setPickerVisible(false);
                  }}
                >
                  <Text style={styles.modelRowText}>{item.name || item.id}</Text>
                  {item.id === selectedModel && <Text style={styles.checkmark}>✓</Text>}
                </TouchableOpacity>
              )}
              style={{ maxHeight: 400 }}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={comparePickerVisible} animationType="slide" transparent onRequestClose={() => setComparePickerVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setComparePickerVisible(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Compare up to {COMPARE_MODEL_CAP} models</Text>
            <FlatList
              data={models.length ? models : [{ id: DEFAULT_MODEL, name: DEFAULT_MODEL }]}
              keyExtractor={(m) => m.id}
              renderItem={({ item }) => {
                const idx = compareModels.indexOf(item.id);
                const isSelected = idx !== -1;
                return (
                  <TouchableOpacity
                    style={styles.modelRow}
                    onPress={() => handleToggleCompareModel(item.id)}
                  >
                    <Text style={styles.modelRowText}>{item.name || item.id}</Text>
                    {isSelected && (
                      <View style={[styles.compareDot, { backgroundColor: COMPARE_COLORS[idx % COMPARE_COLORS.length] }]} />
                    )}
                  </TouchableOpacity>
                );
              }}
              style={{ maxHeight: 400 }}
            />
            <TouchableOpacity
              style={[styles.loginButton, { marginTop: 16, opacity: compareModels.length >= 2 ? 1 : 0.4 }]}
              disabled={compareModels.length < 2}
              onPress={() => {
                setCompareMode(true);
                setComparePickerVisible(false);
              }}
            >
              <Text style={styles.loginButtonText}>
                {compareModels.length < 2 ? 'Pick at least 2 models' : `Compare ${compareModels.length} models`}
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const BG = '#0f0f10';
const CARD = '#1c1c1e';
const ACCENT = '#ffffff';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  center: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center', padding: 24 },
  logo: { color: '#fff', fontSize: 28, fontWeight: '700', marginBottom: 12 },
  subtitle: { color: '#a1a1a6', fontSize: 15, textAlign: 'center', marginBottom: 32, lineHeight: 22 },
  loginButton: { backgroundColor: ACCENT, paddingVertical: 14, paddingHorizontal: 28, borderRadius: 24 },
  codeInput: { backgroundColor: '#1a1a1a', color: '#fff', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, width: '100%', marginVertical: 16, borderWidth: 1, borderColor: '#333' },
  loginButtonText: { color: '#000', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  errorText: { color: '#ff6b6b', marginTop: 16, textAlign: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#262628',
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  modelPicker: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  modelPickerText: { color: '#fff', fontSize: 16, fontWeight: '600', maxWidth: 140 },
  chevron: { color: '#8e8e93', marginLeft: 4 },
  compareButton: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1, borderColor: '#3a3a3c' },
  compareButtonActive: { backgroundColor: '#2a5cff', borderColor: '#2a5cff' },
  compareButtonText: { color: '#8e8e93', fontSize: 13, fontWeight: '600' },
  compareButtonTextActive: { color: '#fff' },
  logoutText: { color: '#8e8e93', fontSize: 14 },
  messageList: { padding: 16, flexGrow: 1 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 100 },
  emptyStateText: { color: '#5a5a5e', fontSize: 16 },
  bubble: { maxWidth: '85%', padding: 12, borderRadius: 16, marginBottom: 10 },
  userBubble: { backgroundColor: '#2a5cff', alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  assistantBubble: { backgroundColor: CARD, alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  errorBubble: { backgroundColor: '#3a1f1f' },
  bubbleText: { color: '#fff', fontSize: 15, lineHeight: 21 },
  attachmentPreviewRow: { flexDirection: 'row', marginBottom: 8, gap: 6 },
  attachmentThumb: { width: 80, height: 80, borderRadius: 10 },
  typingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 8 },
  typingText: { color: '#8e8e93', marginLeft: 8, fontSize: 13 },
  compareRow: { flexDirection: 'column', marginBottom: 10, gap: 8 },
  compareCard: { backgroundColor: CARD, borderRadius: 12, padding: 12, borderWidth: 1.5 },
  compareModelLabel: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  compareCardText: { color: '#fff', fontSize: 14, lineHeight: 20 },
  attachmentBar: { paddingHorizontal: 12, paddingTop: 8 },
  attachmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD,
    borderRadius: 10,
    padding: 6,
    marginRight: 8,
    gap: 6,
  },
  attachmentChipThumb: { width: 32, height: 32, borderRadius: 6 },
  attachmentChipText: { color: '#fff', fontSize: 12, maxWidth: 100 },
  attachmentChipRemove: { color: '#8e8e93', fontSize: 12, paddingHorizontal: 4 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#262628',
    backgroundColor: BG,
  },
  attachButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  attachButtonText: { fontSize: 18 },
  input: {
    flex: 1,
    backgroundColor: CARD,
    color: '#fff',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 120,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  sendButtonText: { color: '#000', fontSize: 18, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: CARD, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 32 },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 12 },
  modelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2c',
  },
  modelRowText: { color: '#fff', fontSize: 15, flex: 1 },
  checkmark: { color: '#2a5cff', fontSize: 16, fontWeight: '700' },
  compareDot: { width: 14, height: 14, borderRadius: 7 },
});
