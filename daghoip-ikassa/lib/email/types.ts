import 'server-only';

/**
 * Contrat d'un service d'envoi d'e-mails.
 *
 * Même forme que l'abstraction des opérateurs de paiement : le reste de
 * l'application ne connaît aucun fournisseur par son nom, seulement ce contrat.
 * En changer revient à écrire un module et à modifier une ligne du registre.
 *
 * Sans fournisseur configuré, l'application **ne casse pas** : les notifications
 * continuent d'arriver dans l'interface et dans la cloche, seule la copie par
 * courriel manque. C'est le mode par défaut, et il est parfaitement utilisable.
 */

export interface OutgoingEmail {
  to: string;
  /** Nom du destinataire, pour l'en-tête `To: "Nom" <adresse>`. */
  toName?: string | null;
  subject: string;
  html: string;
  /** Version texte, obligatoire : certains clients ne rendent pas le HTML, et
   *  un e-mail sans partie texte est plus souvent classé indésirable. */
  text: string;
}

export type SendResult = { ok: true; id?: string } | { ok: false; message: string };

export interface EmailProvider {
  readonly label: string;
  /** `true` si les identifiants nécessaires sont présents dans l'environnement. */
  isConfigured(): boolean;
  send(email: OutgoingEmail): Promise<SendResult>;
}
