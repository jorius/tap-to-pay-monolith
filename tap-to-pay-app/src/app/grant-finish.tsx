import { useRouter } from 'expo-router';
import { useEffect } from 'react';

// paynela://grant-finish is where the wallet sends the buyer after the consent page. The authorization screen reads it
// from WebBrowser.openAuthSessionAsync; expo-router opens the same link, so this route only steps back to that screen.
export default function GrantFinish() {
  const router = useRouter();
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);
  return null;
}
