/**
 * Bliz mobile attribution demo
 *
 * Shows how a mobile app calls `POST /api/v1/attribution/mobile/init` on first open
 * to find out which marketing link (if any) drove the install, and then reports later
 * in-app events to `POST /mobile/analytics/v1` while a token exists.
 *
 * Flow:
 *   1. The user taps a Bliz short link on this device (opens in the browser).
 *   2. The user installs / opens the app.
 *   3. The app sends device characteristics to Bliz (this file).
 *   4. Bliz answers with an encrypted `sid_token` (and a confidence `tier`) if it
 *      matched a recent click from this same device, or `null` for organic installs.
 *   5. The app stores `sid_token` and passes it as `blizid` on every later event
 *      (screen views, taps, sign-up, purchase, ...), so revenue is credited to the
 *      original link. Use only the public key (pk_live_...) in the app.
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
  // Token returned by mobile/init. In a real app, persist it (Keychain / Keystore / AsyncStorage).
  const [sidToken, setSidToken] = useState<string | null>(null);
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

      // Keep the token so later events can be attributed to the original link.
      const parsed = JSON.parse(body) as { sid_token?: string | null };
      setSidToken(parsed.sid_token ?? null);
    } catch (error) {
      setOutput(`Request failed: ${String(error)}`);
    }
  };

  /**
   * Sends one event to `POST /mobile/analytics/v1`, only possible when `mobile/init`
   * returned a token. Same field names as the Bliz web script:
   *   stage              VIEW | ENGAGE | SUBMITS | CONVERSION | CONVERT
   *   source             screen | link | button | form | purchase | conversion
   *   source_identifier  screen name, button id or form id
   *   source_location    screen or deep link, e.g. "app://checkout"
   * The server always records event_source = MOBILE, so it is not sent.
   */
  const sendEvent = async (event: Record<string, unknown>) => {
    if (!sidToken) {
      setOutput('No sid_token yet. Call mobile/init first (organic installs return null).');
      return;
    }
    setOutput('Sending event...');
    try {
      const response = await fetch(`${apiUrl}/mobile/analytics/v1`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${publicKey}`,
        },
        body: JSON.stringify({
          blizid: sidToken,
          timestamp: new Date().toISOString(),
          ...event,
        }),
      });
      setOutput(`HTTP ${response.status}\n${await response.text()}`);
    } catch (error) {
      setOutput(`Request failed: ${String(error)}`);
    }
  };

  const sendScreenView = () =>
    sendEvent({
      stage: 'VIEW',
      source: 'screen',
      source_identifier: 'home',
      source_location: 'app://home',
    });

  const sendButtonTap = () =>
    sendEvent({
      stage: 'ENGAGE',
      source: 'button',
      source_identifier: 'checkout_btn',
      source_location: 'app://cart',
    });

  const sendFormSubmit = () =>
    sendEvent({
      stage: 'SUBMITS',
      source: 'form',
      source_identifier: 'signup_form',
      source_location: 'app://signup',
    });

  // Non-revenue conversion. APP_INSTALLED is recorded as an APP_INSTALL conversion.
  const sendAppInstall = () =>
    sendEvent({
      stage: 'CONVERSION',
      source: 'conversion',
      source_identifier: 'first_open',
      source_location: 'app://home',
      event: 'APP_INSTALLED',
    });

  const sendPurchase = () =>
    sendEvent({
      stage: 'CONVERT',
      source: 'purchase',
      source_identifier: 'checkout',
      source_location: 'app://checkout',
      event: 'PURCHASE_COMPLETED',
      revenue: 49.99,
      currency: 'USD',
      metadata: { order_id: `demo-${Date.now()}` },
    });

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

        <Text style={styles.label}>
          {sidToken ? 'Token received: events enabled' : 'Events need a token from mobile/init'}
        </Text>
        <TouchableOpacity
          style={[styles.buttonSecondary, !sidToken && styles.buttonDisabled]}
          onPress={sendScreenView}
        >
          <Text style={styles.buttonSecondaryText}>Send screen view (VIEW)</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.buttonSecondary, !sidToken && styles.buttonDisabled]}
          onPress={sendButtonTap}
        >
          <Text style={styles.buttonSecondaryText}>Send button tap (ENGAGE)</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.buttonSecondary, !sidToken && styles.buttonDisabled]}
          onPress={sendFormSubmit}
        >
          <Text style={styles.buttonSecondaryText}>Send form submit (SUBMITS)</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.buttonSecondary, !sidToken && styles.buttonDisabled]}
          onPress={sendAppInstall}
        >
          <Text style={styles.buttonSecondaryText}>Send app install (CONVERSION)</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.buttonSecondary, !sidToken && styles.buttonDisabled]}
          onPress={sendPurchase}
        >
          <Text style={styles.buttonSecondaryText}>Send purchase $49.99 (CONVERT)</Text>
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
  buttonSecondary: {
    borderWidth: 1,
    borderColor: '#111',
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonSecondaryText: { color: '#111', fontWeight: '500' },
  buttonDisabled: { opacity: 0.4 },
  outputBox: {
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 6,
    marginTop: 12,
  },
});
