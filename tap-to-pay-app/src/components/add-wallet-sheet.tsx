import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BigButton } from '@/components/big-button';
import { useWalletError } from '@/components/wallet-error';
import type { AppRole } from '@/config/role';
import { Fills } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { defineCopy, useCopy } from '@/i18n';

const copy = defineCopy(
  {
    title: 'Agregar billetera',
    hint: 'Búscala en la app de tu billetera, en «Recibir» o «Mi dirección».',
    info: 'Escribe solo lo que va después de $ilp.interledger-test.dev/. Si es de otro proveedor, pega la dirección completa.',
    label: 'Dirección de la billetera',
    placeholder: '9c0ecd3b o tu alias',
    looking: 'Buscando…',
    found: (name: string, currency: string) => `✓ Encontrada: ${name} · ${currency}`,
    missing: 'No encontramos esa billetera',
    currency: { COP: 'pesos', USD: 'dólares', EUR: 'euros', MXN: 'pesos mexicanos' } as Record<string, string>,
    add: 'Agregar',
    cancel: 'Cancelar',
  },
  {
    title: 'Add a wallet',
    hint: 'Find it in your wallet app, under "Receive" or "My address".',
    info: 'Type only what comes after $ilp.interledger-test.dev/. From another provider? Paste the full address.',
    label: 'Wallet address',
    placeholder: '9c0ecd3b or your alias',
    looking: 'Looking it up…',
    found: (name: string, currency: string) => `✓ Found: ${name} · ${currency}`,
    missing: "We couldn't find that wallet",
    currency: { COP: 'pesos', USD: 'dollars', EUR: 'euros', MXN: 'Mexican pesos' },
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

// Tagged with the address it answers, so typing on leaves the old answer behind without a reset.
type Lookup = { url: string } & ({ state: 'looking' | 'missing' } | { state: 'found'; name: string; assetCode: string });

// Test Wallet addresses all live on this host, so the user types only their own part (9c0ecd3b, an alias).
const TEST_WALLET = 'ilp.interledger-test.dev/';

// A pasted full address ($host/path or http(s)://…) is used as-is, the payment pointer as https; anything else is the
// part after the Test Wallet host.
function walletUrl(typed: string) {
  const text = typed.trim();
  if (/^(\$|https?:\/\/)/i.test(text)) return text.replace(/^\$/, 'https://');
  const path = text.replace(/^\/+/, '').replace(/^ilp\.interledger-test\.dev\//i, '');
  return path ? `https://${TEST_WALLET}${path}` : '';
}

// The "Agregar billetera" sheet of both builds: the phone reads the public wallet address document while the user
// types, and "Agregar" only unlocks once it was found; the service then validates the address and resolves its asset.
// role stays in Props for its callers; the copy is the same for both.
export function AddWalletSheet<T>({ visible, onClose, onAdd, onAdded }: Props<T>) {
  const theme = useTheme();
  const t = useCopy(copy);
  const walletError = useWalletError();
  const [address, setAddress] = useState('');
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // shortcut: a bare $host pointer (spec: https://host/.well-known/pay) is not resolved; add it when a wallet uses one.
  const url = walletUrl(address);
  const pasted = /^(\$|https?:\/\/)/i.test(address.trim());
  const isUrl = /^https?:\/\/[^\s/]+\.[^\s/]+\/\S*$/i.test(url);
  const current = isUrl && lookup?.url === url ? lookup : null;

  useEffect(() => {
    if (!isUrl) return;
    let alive = true;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLookup({ url, state: 'looking' });
      try {
        const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
        const doc = res.ok ? await res.json() : null;
        // Every wallet address document carries its asset; an HTML page or a 404 body is not a wallet.
        if (typeof doc?.assetCode !== 'string') throw new Error('not a wallet');
        const name = typeof doc.publicName === 'string' ? doc.publicName : url.replace(/^https?:\/\//, '');
        if (alive) setLookup({ url, state: 'found', name, assetCode: doc.assetCode });
      } catch {
        if (alive) setLookup({ url, state: 'missing' });
      }
    }, 400);
    return () => {
      alive = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [url, isUrl]);

  const close = () => {
    setAddress('');
    setError(null);
    onClose();
  };

  const submit = async () => {
    if (current?.state !== 'found' || busy) return;
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

  const status = error
    ? { text: error, color: theme.outflow }
    : current?.state === 'found'
      ? { text: t.found(current.name, t.currency[current.assetCode] ?? current.assetCode), color: theme.income }
      : current?.state === 'missing'
        ? { text: t.missing, color: theme.outflow }
        : current?.state === 'looking'
          ? { text: t.looking, color: theme.muted }
          : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.root}>
        <Pressable accessibilityLabel={t.cancel} onPress={close} style={styles.backdrop} />
        <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: theme.surface }]}>
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
          <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
            {t.title}
          </Text>
          <Text style={[styles.hint, { color: theme.muted }]}>{t.hint}</Text>
          <View style={[styles.info, { backgroundColor: theme.primaryTint }]}>
            <MaterialCommunityIcons name="information-outline" size={20} color={theme.primaryInk} />
            <Text style={[styles.infoText, { color: theme.text }]}>{t.info}</Text>
          </View>
          <Text style={[styles.label, { color: theme.text }]}>{t.label}</Text>
          <View style={[styles.inputRow, { borderColor: status?.color ?? theme.border }]}>
            {!pasted && <Text style={[styles.prefix, { color: theme.muted }]}>${TEST_WALLET}</Text>}
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
              placeholder={t.placeholder}
              placeholderTextColor={theme.muted}
              onSubmitEditing={submit}
              style={[styles.input, { color: theme.text }]}
            />
          </View>
          <View accessibilityLiveRegion="polite" style={styles.status}>
            {status && <Text style={[styles.statusText, { color: status.color }]}>{status.text}</Text>}
          </View>
          <BigButton label={t.add} color={Fills.primary} disabled={busy || current?.state !== 'found'} onPress={submit} />
          <Pressable accessibilityRole="button" onPress={close} style={styles.cancel}>
            <Text style={[styles.cancelText, { color: theme.text }]}>{t.cancel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  sheet: { padding: 20, paddingTop: 10, gap: 12, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2 },
  title: { fontSize: 22, fontWeight: '700' },
  hint: { fontSize: 15, lineHeight: 21, marginTop: -6 },
  info: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },
  infoText: { flex: 1, fontSize: 13, lineHeight: 18 },
  label: { fontSize: 14, fontWeight: '600' },
  inputRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderRadius: 12, paddingHorizontal: 14 },
  prefix: { fontSize: 13, fontFamily: 'monospace' },
  input: { flex: 1, minHeight: 48, fontSize: 15, fontFamily: 'monospace', paddingVertical: 0 },
  status: { minHeight: 20 },
  statusText: { fontSize: 15, fontWeight: '600' },
  cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 16, fontWeight: '600' },
});
