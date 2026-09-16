import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { startOpenRouterLogin, finishOpenRouterLogin, getStoredKey, logout } from './lib/auth';
import { fetchModels, sendChat } from './lib/openrouter';

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

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
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
      .then(setModels)
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

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    const userMsg = { id: Date.now() + '-u', role: 'user', content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setSending(true);
    try {
      const reply = await sendChat(apiKey, selectedModel, nextMessages);
      setMessages((prev) => [...prev, { id: Date.now() + '-a', role: 'assistant', content: reply }]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + '-e', role: 'error', content: e.message },
      ]);
    } finally {
      setSending(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [input, sending, messages, apiKey, selectedModel]);

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
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logoutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.messageList}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.role === 'user' ? styles.userBubble : styles.assistantBubble,
              item.role === 'error' && styles.errorBubble,
            ]}
          >
            <Text style={styles.bubbleText}>{item.content}</Text>
          </View>
        )}
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
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Message..."
            placeholderTextColor="#8e8e93"
            multiline
          />
          <TouchableOpacity style={styles.sendButton} onPress={handleSend} disabled={sending || !input.trim()}>
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
  loginButtonText: { color: '#000', fontSize: 16, fontWeight: '600' },
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
  modelPicker: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  modelPickerText: { color: '#fff', fontSize: 16, fontWeight: '600', maxWidth: 220 },
  chevron: { color: '#8e8e93', marginLeft: 4 },
  logoutText: { color: '#8e8e93', fontSize: 14 },
  messageList: { padding: 16, flexGrow: 1 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 100 },
  emptyStateText: { color: '#5a5a5e', fontSize: 16 },
  bubble: { maxWidth: '85%', padding: 12, borderRadius: 16, marginBottom: 10 },
  userBubble: { backgroundColor: '#2a5cff', alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  assistantBubble: { backgroundColor: CARD, alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  errorBubble: { backgroundColor: '#3a1f1f' },
  bubbleText: { color: '#fff', fontSize: 15, lineHeight: 21 },
  typingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 8 },
  typingText: { color: '#8e8e93', marginLeft: 8, fontSize: 13 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#262628',
    backgroundColor: BG,
  },
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
});
