# Documentation développeur

Comment ce projet est organisé, pourquoi il l'est ainsi, et comment y ajouter
quelque chose sans casser ce qui tient.

Pour l'installer : [`INSTALLATION.md`](INSTALLATION.md).
Pour appeler ses fonctions : [`API.md`](API.md).

---

## Sommaire

1. [Le principe qui gouverne tout le reste](#le-principe-qui-gouverne-tout-le-reste)
2. [Où vit quoi](#où-vit-quoi)
3. [Lecture et écriture](#lecture-et-écriture)
4. [Conventions](#conventions)
5. [Ajouter une fonctionnalité](#ajouter-une-fonctionnalité)
6. [Modifier le schéma](#modifier-le-schéma)
7. [Les tests](#les-tests)
8. [Pièges connus](#pièges-connus)

---

## Le principe qui gouverne tout le reste

**La sécurité vit dans PostgreSQL, pas dans l'application.**

Ce n'est pas une préférence esthétique, c'est une contrainte de la plateforme :
le navigateur parle **directement** à Supabase avec la clé anonyme, pour la
recherche instantanée et la messagerie temps réel. N'importe qui peut ouvrir la
console et forger la requête de son choix. Si l'autorisation vivait dans le code
Next.js, elle serait contournable en trois lignes.

Trois couches, dans cet ordre :

| Couche                    | Répond à la question       | Contourne-t-elle ?                                                           |
| ------------------------- | -------------------------- | ---------------------------------------------------------------------------- |
| **RLS**                   | Quelles lignes ?           | Non — s'applique à toute requête, quelle qu'en soit l'origine.               |
| **Privilèges de colonne** | Quelles colonnes ?         | Non — `role` hors du `GRANT UPDATE` rend l'auto-promotion impossible.        |
| **Zod, dans les actions** | La forme est-elle valide ? | Oui, si l'on passe par la RPC directement — d'où les deux couches au-dessus. |

Corollaire pratique : **ne réécrivez pas un filtre de propriété dans le code
TypeScript**. Le faire donne l'illusion que la sécurité dépend de ce fichier,
alors qu'elle tient à la base — et le jour où quelqu'un supprime le filtre
« redondant », personne ne sait plus lequel protégeait vraiment.

Les contrôles côté application restent utiles pour **ne pas afficher** un
formulaire qui serait refusé. C'est de l'ergonomie, pas de la sécurité, et les
commentaires du code le disent explicitement là où le doute est possible.

---

## Où vit quoi

```
app/          Routes, gabarits et Server Actions
  actions/    Écritures ('use server'), revalidées avec Zod
  api/        Deux gestionnaires REST seulement (rappels d'opérateur, file d'e-mails)
components/   Composants React, groupés par domaine
lib/          Infrastructure : Supabase, paiements, IA, e-mail, i18n, env
services/     Lectures (Server Components uniquement)
hooks/        Comportements navigateur réutilisables
utils/        Fonctions pures — aucune dépendance à Next ni à Supabase
types/        Typage partagé, dont le miroir du schéma SQL
supabase/     Migrations, données de référence, suites de tests
tests/        Tests unitaires, de composants et d'intégration
scripts/      Contrôles hors application (configuration, budget de poids)
docs/         Ce dossier
```

La règle qui décide entre `utils/` et `lib/` : **`utils/` ne connaît rien**. Pas
de Next, pas de Supabase, pas de variables d'environnement. C'est ce qui rend
ces modules testables sans le moindre harnais — et la raison pour laquelle la
plupart des tests unitaires y pointent.

---

## Lecture et écriture

**Les `services/` lisent, les `actions/` écrivent.** Un service est appelé
depuis un Server Component ; il importe `server-only`, ce qui fait échouer le
build si quelqu'un le tire dans un composant client.

**Deux exceptions assumées**, où le navigateur appelle une RPC directement :
l'envoi d'un message et l'accusé de lecture. Un aller-retour par Next.js n'y
apporterait aucune garantie — la RLS et les triggers s'appliquent de la même
façon — et ne ferait que retarder l'affichage de son propre message dans une
messagerie temps réel.

### Forme d'une Server Action

```ts
'use server';

export async function faireQuelqueChoseAction(
  _prevState: ActionResult<Donnee> | null,
  formData: FormData,
): Promise<ActionResult<Donnee>> {
  try {
    const user = await requireUser();

    const rate = checkRateLimit(`action:${user.id}`, LIMITE, FENETRE);
    if (!rate.success) return { success: false, error: 'Trop de tentatives.' };

    const parsed = schema.safeParse({ champ: formData.get('champ') });
    if (!parsed.success) {
      return {
        success: false,
        error: 'Veuillez corriger les champs signalés.',
        fieldErrors: toFieldErrors(parsed.error),
      };
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc('faire_quelque_chose', { … });
    if (error) return fail(error, 'Message écrit pour être lu.');

    revalidatePath('/chemin/concerné');
    return ok(donnee);
  } catch (error) {
    return fail(error);
  }
}
```

Les points qui comptent :

- **jamais de `throw` qui remonte jusqu'à l'interface** — une action renvoie un
  `ActionResult`, et le formulaire l'affiche ;
- **`fail(error, message)`** journalise le détail côté serveur et ne renvoie
  qu'un texte lisible : les messages d'erreur ne doivent pas décrire la base ;
- **`revalidatePath`** est facile à oublier, et son absence se voit comme une
  page qui n'a pas bougé après une action réussie ;
- une action de **mesure** (audience, historique) ne lève jamais et ne renvoie
  rien : elle est déclenchée en marge d'un geste qui a sa propre valeur, et son
  échec ne doit pas empêcher ce geste d'aboutir.

### Un module `'use server'` n'exporte que des fonctions asynchrones

Une constante exportée depuis un fichier `'use server'` **fait échouer le
build**. C'est pour cette raison que `DELETE_CONFIRMATION` vit dans
`lib/account/deletion.ts` et non à côté de l'action qui s'en sert.

---

## Conventions

**Tout en français** : code, commentaires, noms de fichiers de documentation,
messages d'interface, messages de commit. Les identifiants SQL restent en
anglais, par convention PostgreSQL.

**Les commentaires expliquent le _pourquoi_.** Le _quoi_ est déjà dans le code.
Un commentaire utile décrit la contrainte qui a dicté le choix, ou le défaut
qu'on a rencontré — pas la ligne qu'il surplombe.

**`SECURITY DEFINER`** n'est employé que dans cinq cas, et chaque occurrence dit
lequel : lecture de rôle, écriture destinée à d'autres, maintenance planifiée,
agrégat de supervision, encaissement.

**Accessibilité** : les composants sont interrogés dans les tests par leurs
rôles et noms accessibles. Un `aria-describedby` cassé n'a aucun effet visible ;
c'est précisément pour cela qu'il est testé.

**Pas de dépendance ajoutée sans nécessité démontrée.** Le projet compte onze
dépendances d'exécution. Les deux ajouts récents — `jsdom` et `esbuild` —
concernent uniquement les tests de composants, et ne se contournent pas : Node
ne transforme pas le JSX et ne fournit pas de DOM.

---

## Ajouter une fonctionnalité

L'ordre compte, parce que chaque étape suppose la précédente.

**1. La base d'abord.** Une nouvelle migration
`supabase/migrations/AAAAMMJJHHMMSS_sujet.sql`, idempotente. Table, index, RLS,
privilèges de colonne, fonctions.

**2. Une suite de tests SQL**, `supabase/tests/NN_sujet_tests.sql`. Elle doit
couvrir le cas nominal **et** les tentatives d'abus : lire ce qui appartient à
autrui, écrire un compteur, appeler une fonction interne.

> Quand un test vérifie qu'une opération est **refusée**, ajoutez un témoin :
> la même opération jouée par un compte légitime, qui doit réussir. Sans lui,
> une faute de frappe dans la requête passe pour un refus et le test verdit sans
> rien prouver.

**3. Le typage**, dans `types/database.ts` : tables, colonnes, énumérations,
signatures des RPC. Le test d'intégration vérifie la conformité — mais après
coup, pas à votre place.

**4. Le service ou l'action**, selon qu'on lit ou qu'on écrit.

**5. L'interface**, et ses tests de composant si elle porte une logique.

**6. La documentation** : [`API.md`](API.md) si vous ajoutez une RPC appelée
par l'application — un test vérifie que tout appel statique y figure.

---

## Modifier le schéma

**Jamais en modifiant une migration déjà appliquée.** Elles sont idempotentes
mais pas rétroactives : une migration déjà jouée en production ne le sera pas
une seconde fois. Ajoutez-en une nouvelle.

Après toute modification :

```bash
npm run test:sql    # rejoue tout, puis compare le typage au schéma réel
```

Cette dernière comparaison est la seule protection contre la dérive entre
`types/database.ts` — écrit à la main — et la base réelle. Une colonne oubliée
côté TypeScript ne se voit nulle part ailleurs : `tsc` compile, la CI est verte,
et la requête échoue en production.

---

## Les tests

| Commande              | Ce qu'elle couvre                                        | Besoin        |
| --------------------- | -------------------------------------------------------- | ------------- |
| `npm run test:unit`   | Modules purs : téléphone, slugs, typographie, signatures | rien          |
| `npm run test:ui`     | Composants : accessibilité, états, bascules optimistes   | jsdom         |
| `npm run test:sql`    | Schéma, RLS, règles métier, conformité du typage         | PostgreSQL 16 |
| `npm run verify:perf` | Poids de premier chargement, par page                    | un build      |
| `npm run verify`      | Typage + lint + tests + build                            | rien          |

**Écrivez un test qui peut échouer.** Avant de considérer un test comme acquis,
cassez volontairement le comportement qu'il protège et vérifiez qu'il rougit.
Un test qui n'a jamais échoué n'atteste rien — plusieurs défauts de ce projet
ont été trouvés exactement comme cela.

**Les tests unitaires et de composants tournent séparément**, et ce n'est pas
cosmétique : `getServerEnv()` lève dès que `window` existe — c'est le garde-fou
qui empêche un secret de partir au navigateur. Un jsdom chargé pour tout le
monde ferait échouer les tests de configuration, ou pire, les ferait passer en
testant autre chose que le chemin de production.

**Le JSX ne se teste pas sans transformation.** `--experimental-strip-types`
retire les annotations de type ; ce n'est pas un compilateur, et `<Button>` lui
apparaît comme une comparaison. D'où `esbuild`, dans `tests/tsx-hooks.mjs`. Il
ne vérifie **aucun type** : ce rôle est celui de `tsc`.

---

## Pièges connus

Ceux-là ont chacun coûté du temps une première fois.

**`id` arrive en chaîne dans `generateSitemaps`.** Il vient du segment d'URL,
quoi qu'en dise le typage. Une comparaison stricte à `0` échoue en silence.

**Next ne produit pas d'index pour `generateSitemaps`.** `/sitemap.xml` doit
être écrit à la main, sans quoi `robots.txt` pointe vers une 404 — et le build
affiche pourtant « 3 sitemaps generated ».

**`now()` renvoie l'heure de début de transaction.** Pour ordonner des
événements créés dans la même transaction, c'est `clock_timestamp()` qu'il faut,
sinon l'ordre est arbitraire.

**Satori (les images de partage) ne gère ni `background-image` distant, ni la
transparence derrière une `<img>` qui remplit son conteneur.** Le fond posé
derrière est simplement remplacé.

**Une fonction `SECURITY INVOKER` ne peut pas lire une table fermée aux
clients.** `seller_performance()` était inutilisable par les vendeurs pour
cette raison exacte, sans que rien ne le signale avant qu'un test ne l'appelle
sous un vrai rôle.

**Les variables `NEXT_PUBLIC_*` sont figées au build.** Les changer au
démarrage d'un conteneur n'a aucun effet sur le code envoyé au navigateur. Une
image publiée est liée à un projet Supabase et à un domaine.
