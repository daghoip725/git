/**
 * Composition des e-mails de notification.
 *
 * Un e-mail part hors de notre contrôle : on ne peut ni le corriger, ni le
 * retirer. Les deux propriétés testées ici sont donc celles qui feraient le
 * plus de dégâts si elles cédaient — l'échappement du contenu utilisateur, et
 * le refus de tout lien vers un domaine tiers sous notre nom.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://exemple.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'cle-anonyme-factice-pour-les-tests';
process.env.NEXT_PUBLIC_SITE_URL ??= 'https://daghoip-ikassa.ga';

const { renderNotificationEmail } = await import('@/lib/email/templates');

describe('renderNotificationEmail', () => {
  it('produit systématiquement un sujet, un HTML et une version texte', () => {
    const email = renderNotificationEmail(
      'ad_approved',
      {
        title: 'Votre annonce est approuvée',
        body: 'Elle est en ligne.',
        link: '/annonces/x-AB12',
      },
      'Awa Mbourou',
    );

    assert.ok(email.subject.length > 0);
    assert.match(email.html, /<!doctype html>/i);
    // La partie texte n'est pas décorative : sans elle, l'e-mail est bien plus
    // souvent classé indésirable.
    assert.ok(email.text.length > 20);
  });

  it('échappe le contenu rédigé par un utilisateur', () => {
    const email = renderNotificationEmail(
      'new_message',
      {
        title: '<script>alert(1)</script>',
        body: 'Bonjour "toi" & <b>salut</b>',
        link: '/messages/abc',
      },
      null,
    );

    assert.ok(!email.html.includes('<script>'), 'aucune balise script ne doit survivre');
    assert.ok(email.html.includes('&lt;script&gt;'));
    assert.ok(email.html.includes('&amp;'));
  });

  it('n’accepte qu’un lien interne', () => {
    for (const hostile of [
      'https://evil.example/phishing',
      '//evil.example',
      'javascript:alert(1)',
      'mailto:quelquun@example.com',
      42,
      null,
    ]) {
      const email = renderNotificationEmail('system', { title: 'Test', link: hostile }, null);
      assert.ok(
        !email.html.includes('evil.example') && !email.html.includes('javascript:'),
        `lien refusé : ${String(hostile)}`,
      );
      assert.ok(email.html.includes('https://daghoip-ikassa.ga'));
    }
  });

  it('transforme un chemin interne en URL absolue', () => {
    const email = renderNotificationEmail(
      'new_message',
      { title: 'A', link: '/messages/42' },
      null,
    );
    assert.ok(email.html.includes('https://daghoip-ikassa.ga/messages/42'));
    assert.ok(email.text.includes('https://daghoip-ikassa.ga/messages/42'));
  });

  it('adapte le sujet et le bouton au type de notification', () => {
    const message = renderNotificationEmail('new_message', { title: 'X' }, null);
    const approved = renderNotificationEmail('ad_approved', { title: 'Y' }, null);

    assert.notEqual(message.subject, approved.subject);
    assert.ok(message.html.includes('Répondre'));
    assert.ok(approved.html.includes('Voir mon annonce'));
  });

  it('salue par le prénom, et reste correct sans nom', () => {
    const named = renderNotificationEmail('system', { title: 'X' }, 'Awa Mbourou');
    assert.ok(named.text.startsWith('Bonjour Awa,'));

    const anonymous = renderNotificationEmail('system', { title: 'X' }, null);
    assert.ok(anonymous.text.startsWith('Bonjour,'));
  });

  it('porte toujours le lien de gestion des préférences', () => {
    const email = renderNotificationEmail('new_message', { title: 'X' }, null);
    // Un e-mail sans moyen de s'en désabonner est un e-mail qu'on signale.
    assert.ok(email.html.includes('/compte/notifications'));
    assert.ok(email.text.includes('/compte/notifications'));
  });

  it('ne casse pas sur une charge utile vide ou d’un type inattendu', () => {
    assert.doesNotThrow(() => renderNotificationEmail('system', {}, null));
    assert.doesNotThrow(() =>
      renderNotificationEmail('new_favorite', { title: 123, body: {}, link: [] }, null),
    );
  });
});
