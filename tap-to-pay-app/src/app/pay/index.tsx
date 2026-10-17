import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { BigButton } from '@/components/big-button';
import { paymentCode } from '@/components/buyer/payment-code';
import { Screen } from '@/components/screen';
import { StatusPill } from '@/components/status-pill';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fills } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy } from '@/i18n';

const copy = defineCopy(
  {
    scan: 'Apunta la cámara al QR del cobro',
    allow: 'Permitir la cámara',
    denied: 'Sin permiso de cámara: pega el link abajo.',
    paste: 'O pega el link que te enviaron',
    placeholder: 'http://…/p/AbC123 o el código',
    go: 'Continuar',
    invalid: 'Ese texto no es un link de pago.',
  },
  {
    scan: "Point the camera at the payment's QR",
    allow: 'Allow the camera',
    denied: 'No camera permission: paste the link below.',
    paste: 'Or paste the link you were sent',
    placeholder: 'http://…/p/AbC123 or the code',
    go: 'Continue',
    invalid: 'That text is not a payment link.',
  },
);

// Pay with a QR or link: scan the vendor's QR, or paste the link that arrived by WhatsApp, then the payment screen.
export default function ScanScreen() {
  const router = useRouter();
  const theme = useTheme();
  const t = useCopy(copy);
  const [permission, requestPermission] = useCameraPermissions();
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);
  // One scan opens one payment screen; coming back here allows the next one.
  const opened = useRef(false);
  useFocusEffect(
    useCallback(() => {
      opened.current = false;
    }, []),
  );

  const open = (value: string) => {
    const code = paymentCode(value);
    if (!code) return setInvalid(true);
    if (opened.current) return;
    opened.current = true;
    setInvalid(false);
    router.push({ pathname: '/pay/[code]', params: { code } });
  };

  return (
    <Screen>
      <ThemedText type="subtitle">{t.scan}</ThemedText>
      {permission?.granted ? (
        <View style={styles.camera}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => {
              if (paymentCode(data)) open(data);
            }}
          />
        </View>
      ) : permission && !permission.canAskAgain ? (
        <StatusPill tone="bad" label={t.denied} />
      ) : (
        <BigButton label={t.allow} color={Fills.primary} onPress={requestPermission} />
      )}

      <ThemedView card>
        <ThemedText type="caption">{t.paste}</ThemedText>
        <TextInput
          value={text}
          onChangeText={(value) => {
            setText(value);
            setInvalid(false);
          }}
          placeholder={t.placeholder}
          placeholderTextColor={theme.muted}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
        />
        {invalid && <StatusPill tone="bad" label={t.invalid} />}
        <BigButton label={t.go} color={Fills.primary} disabled={!text.trim()} onPress={() => open(text)} />
      </ThemedView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  camera: { height: 320, borderRadius: 16, overflow: 'hidden' },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 16 },
});
