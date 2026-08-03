/**
 * Doublure de `next/navigation`.
 *
 * Les composants clients appellent `useRouter().refresh()` ou `.replace()`
 * après une action réussie. Ces appels sont **observables** : les tests
 * vérifient qu'ils ont lieu, ce qui est le comportement à protéger — un
 * formulaire qui enregistre sans rafraîchir laisse une page périmée à l'écran.
 *
 * `calls` conserve la trace, `reset()` la vide entre deux tests.
 */
export const calls = { push: [], replace: [], refresh: 0, back: 0 };

export function reset() {
  calls.push = [];
  calls.replace = [];
  calls.refresh = 0;
  calls.back = 0;
}

export function useRouter() {
  return {
    push: (href) => calls.push.push(href),
    replace: (href) => calls.replace.push(href),
    refresh: () => {
      calls.refresh += 1;
    },
    back: () => {
      calls.back += 1;
    },
    forward: () => {},
    prefetch: () => {},
  };
}

export function usePathname() {
  return '/';
}

export function useSearchParams() {
  return new URLSearchParams();
}

export function useParams() {
  return {};
}

export function redirect(href) {
  throw new Error(`REDIRECT:${href}`);
}

export function notFound() {
  throw new Error('NOT_FOUND');
}
