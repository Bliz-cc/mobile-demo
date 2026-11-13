/**
 * Bliz mobile attribution demo
 *
 * Shows how a mobile app calls `POST /api/v1/attribution/mobile/init` on first open
 * to find out which marketing link (if any) drove the install.
 *
 * Flow:
 *   1. The user taps a Bliz short link on this device (opens in the browser).
 *   2. The user installs / opens the app.
 *   3. The app sends device characteristics to Bliz (this file).
 *   4. Bliz answers with an encrypted `sid_token` (and a confidence `tier`) if it
 *      matched a recent click from this same device, or `null` for organic installs.
 *   5. The app stores `sid_token` and later passes it as `blizid` on in-app events
 *      (sign-up, purchase, ...) sent from your backend, so revenue is credited to the
 *      original link.
 */
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  Dimensions,
  PixelRatio,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { getLocales } from 'expo-localization';

// Configured through `.env` (see `.env.example`). Falls back to a local API for development.
// Android emulators reach the host machine at 10.0.2.2 instead of localhost.
const DEFAULT_API_URL =
  process.env.EXPO_PUBLIC_BLIZ_API_URL ??
  (Platform.OS === 'android' ? 'http://10.0.2.2:3008' : 'http://localhost:3008');

// Public key (pk_live_...). Safe to ship inside the app; never put a secret key (sk_live_...) here.
const DEFAULT_PUBLIC_KEY = process.env.EXPO_PUBLIC_BLIZ_PK ?? '';

/**
 * Builds the device description Bliz uses to match this app open to an earlier link click.
 * Values must match what a browser reports on the same phone, so they are sent in
 * logical units (points / dp), not physical pixels.
 */
function buildInitPayload() {
  // 'screen' = full display size. Do not use 'window', which excludes system bars on Android.
  const screen = Dimensions.get('screen');

  return {
    sw: screen.width, // logical screen width (pt / dp)
    sh: screen.height, // logical screen height (pt / dp)
    sc: PixelRatio.get(), // screen scale / pixel density
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone, // IANA name, e.g. "Asia/Tbilisi"
    lang: getLocales()[0]?.languageTag ?? 'en-US', // primary device language
    os: Platform.OS === 'ios' ? 'ios' : 'android',
    mtp: 1, // mobile devices are always touch capable
    os_version: String(Platform.Version), // optional, for analytics only
  };
}

export default function App() {
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [publicKey, setPublicKey] = useState(DEFAULT_PUBLIC_KEY);
  const [output, setOutput] = useState('');
  const payload = buildInitPayload();

  /**
   * Call this ONCE on the first app open. In a real app, persist a local flag after
   * a successful response and store `sid_token` securely (Keychain / Keystore /
   * AsyncStorage) so it can be attached to later events as `blizid`.
   */
  const callMobileInit = async () => {
    setOutput('Calling mobile/init...');
    try {
      const response = await fetch(`${apiUrl}/api/v1/attribution/mobile/init`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${publicKey}`,
        },
        body: JSON.stringify(payload),
      });

      // Expected body: { "sid_token": "<encrypted token>" | null, "tier": "prob_high" | "prob_low" | null }
      const body = await response.text();
      setOutput(`HTTP ${response.status}\n${body}`);
    } catch (error) {
      setOutput(`Request failed: ${String(error)}`);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Bliz mobile/init tester</Text>

        <Text style={styles.label}>API base URL</Text>
        <TextInput
          style={styles.input}
          value={apiUrl}
          onChangeText={setApiUrl}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>Public key (pk_live_...)</Text>
        <TextInput
          style={styles.input}
          value={publicKey}
          onChangeText={setPublicKey}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>Payload sent</Text>
        <Text style={styles.mono}>{JSON.stringify(payload, null, 2)}</Text>

        <TouchableOpacity style={styles.button} onPress={callMobileInit}>
          <Text style={styles.buttonText}>Call mobile/init</Text>
        </TouchableOpacity>

        <View style={styles.outputBox}>
          <Text style={styles.mono} selectable>
            {output || 'No response yet'}
          </Text>
        </View>
      </ScrollView>
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#faf7f2' },
  content: { padding: 16, gap: 8 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 8 },
  label: { fontSize: 12, color: '#666', marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 6,
  },
  mono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12 },
  button: {
    backgroundColor: '#111',
    padding: 14,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonText: { color: '#fff', fontWeight: '600' },
  outputBox: {
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 6,
    marginTop: 12,
  },
});
