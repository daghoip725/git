/**
 * Gabarit commun aux pages légales (conditions, confidentialité, cookies).
 * La classe `prose-like` est reproduite en utilitaires Tailwind afin d'éviter
 * une dépendance au plugin typography.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container-app max-w-3xl py-8 sm:py-12">
      <article className="[&_a]:text-brand-800 [&_a]:underline [&_a]:underline-offset-2 [&_h1]:mb-2 [&_h1]:text-2xl [&_h1]:font-extrabold [&_h1]:text-brand-900 sm:[&_h1]:text-3xl [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-brand-900 [&_li]:mb-1 [&_li]:text-neutral-700 [&_p]:mb-3 [&_p]:leading-relaxed [&_p]:text-neutral-700 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </article>
    </div>
  );
}
