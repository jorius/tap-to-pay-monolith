import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { apiUrl } from '@/api/client';
import { BigButton } from '@/components/big-button';
import { StatusPill } from '@/components/status-pill';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FilterChips } from '@/components/vendor/chips';
import { locale } from '@/components/vendor/format';
import { Brand } from '@/constants/theme';
import { defineCopy, useCopy, useLang } from '@/i18n';

const copy = defineCopy(
  {
    title: 'Resumen del mes en PDF',
    body: 'Ingresos, ventas, ticket promedio, clientes, tasa de aprobación y tendencia de 6 meses: lo que suele pedir una entidad para un crédito.',
    month: 'Mes del resumen',
    download: 'Descargar PDF',
    failed: 'No se pudo abrir el PDF.',
  },
  {
    title: 'Monthly statement as a PDF',
    body: 'Revenue, sales, average ticket, customers, approval rate and a 6-month trend: what a lender usually asks for.',
    month: 'Statement month',
    download: 'Download PDF',
    failed: "Couldn't open the PDF.",
  },
);

// The last three local months as YYYY-MM, newest first.
function recentMonths(): { key: string; date: Date }[] {
  const now = new Date();
  return [0, 1, 2].map((back) => {
    const date = new Date(now.getFullYear(), now.getMonth() - back, 1);
    return { key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`, date };
  });
}

// The vendor's monthly statement (GET /vendors/:id/statement.pdf), opened in the in-app browser, which shows the PDF
// and offers to save or share it.
export function StatementCard({ vendorId }: { vendorId: string }) {
  const t = useCopy(copy);
  const lang = useLang();
  const months = recentMonths();
  const [month, setMonth] = useState(months[0].key);
  const [failed, setFailed] = useState(false);

  const open = async () => {
    setFailed(false);
    try {
      await WebBrowser.openBrowserAsync(`${apiUrl}/vendors/${vendorId}/statement.pdf?month=${month}&lang=${lang}`);
    } catch {
      setFailed(true);
    }
  };

  return (
    <ThemedView card>
      <View style={styles.head}>
        <MaterialCommunityIcons name="file-chart-outline" size={28} color={Brand.tealDark} />
        <ThemedText type="subtitle" style={styles.title}>
          {t.title}
        </ThemedText>
      </View>
      <ThemedText type="caption">{t.body}</ThemedText>
      <FilterChips
        label={t.month}
        options={months.map((m) => ({
          value: m.key,
          label: m.date.toLocaleDateString(locale(lang), { month: 'long', year: 'numeric' }),
        }))}
        value={month}
        onChange={setMonth}
      />
      <BigButton label={t.download} color={Brand.tealDark} onPress={open} />
      {failed && <StatusPill tone="bad" label={t.failed} />}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1 },
});
