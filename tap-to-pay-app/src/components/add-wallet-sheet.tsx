import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BigButton } from '@/components/big-button';
import { StatusPill } from '@/components/status-pill';
import { useWalletError } from '@/components/wallet-error';
import type { AppRole } from '@/config/role';
import { Fill } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy } from '@/i18n';

const copy = defineCopy(
  {
    title: 'Agregar billetera',
    label: 'Dirección de la billetera',
    help: {
      buyer: 'Pega la URL de tu billetera (Open Payments). La moneda se lee de la billetera; llega sin autorización.',
      vendor: 'Pega la URL de la billetera donde quieres recibir cobros (Open Payments). La moneda se lee de la billetera.',
    },
    notUrl: 'Escribe la dirección completa, por ejemplo https://ilp.interledger-test.dev/ana',
    add: 'Agregar',
    cancel: 'Cancelar',
  },
  {
    title: 'Add a wallet',
    label: 'Wallet address',
    help: {
      buyer: 'Paste your wallet URL (Open Payments). The currency is read from the wallet; it arrives without authorization.',
      vendor: 'Paste the URL of the wallet that should receive charges (Open Payments). The currency is read from the wallet.',
    },
    notUrl: 'Type the full address, for example https://ilp.interledger-test.dev/ana',
    add: 'Add',
    cancel: 'Cancel',
  },
);

type Props<T> = {
  role: AppRole;
  visible: boolean;
  onClose: () => void;
  onAdd: (walletAddress: string) => Promise<T>;
  onAdded?: (added: T) => void;
};

// The "Agregar billetera" sheet of both builds: one URL field; the service validates the address and resolves its asset.
export function AddWalletSheet<T>({ role, visible, onClose, onAdd, onAdded }: Props<T>) {
  const theme = useTheme();
  const t = useCopy(copy);
  const walletError = useWalletError();
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setAddress('');
    setError(null);
    onClose();
  };

  const submit = async () => {
    // A payment pointer ($ilp.example/ana) is the same address as https://ilp.example/ana.
    const url = address.trim().replace(/^\$/, 'https://');
    if (!/^https?:\/\/\S+$/i.test(url)) {
      setError(t.notUrl);
      return;
    }
    setBusy(true);
    try {
      const added = await onAdd(url);
      close();
      onAdded?.(added);
    } catch (e) {
      setError(walletError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.root}>
        <Pressable accessibilityLabel={t.cancel} onPress={close} style={styles.backdrop} />
        <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: theme.background }]}>
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
          <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
            {t.title}
          </Text>
          <Text style={[styles.label, { color: theme.text }]}>{t.label}</Text>
          <TextInput
            accessibilityLabel={t.label}
            value={address}
            onChangeText={(text) => {
              setAddress(text);
              setError(null);
            }}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            placeholder="https://ilp.interledger-test.dev/…"
            placeholderTextColor={theme.muted}
            onSubmitEditing={submit}
            style={[styles.input, { color: theme.text, borderColor: error ? theme.badInk : theme.border }]}
          />
          <Text style={[styles.help, { color: theme.muted }]}>{t.help[role]}</Text>
          <View accessibilityLiveRegion="polite">{error && <StatusPill tone="bad" label={error} />}</View>
          <BigButton label={t.add} color={Fill[role]} disabled={busy || address.trim() === ''} onPress={submit} />
          <BigButton label={t.cancel} color={theme.text} ghost onPress={close} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  sheet: { padding: 20, paddingTop: 10, gap: 12, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2 },
  title: { fontSize: 18, fontWeight: '800' },
  label: { fontSize: 14, fontWeight: '600' },
  input: { minHeight: 52, borderWidth: 2, borderRadius: 12, paddingHorizontal: 14, fontSize: 15, fontFamily: 'monospace' },
  help: { fontSize: 13, lineHeight: 18 },
});
