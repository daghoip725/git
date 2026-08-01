'use client';

/**
 * Capture de la position approximative du bien.
 *
 * Choix assumés :
 *  - **aucune carte** n'est affichée : la CSP de l'application interdit les
 *    tuiles de fournisseurs tiers, et une carte n'apporterait rien à la saisie ;
 *  - la position est **arrondie côté base à trois décimales** (~110 m). Le
 *    vendeur indique un quartier, pas son domicile. L'arrondi est annoncé
 *    explicitement à l'utilisateur ;
 *  - la géolocalisation n'est jamais demandée au chargement : uniquement sur
 *    clic, ce qui évite la bannière de permission intempestive du navigateur.
 */
import { Crosshair, Loader2, MapPin, X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';

export interface GeoLocationFieldProps {
  latitude: number | null;
  longitude: number | null;
  onChange: (position: { latitude: number | null; longitude: number | null }) => void;
  error?: string;
}

/** Traduit les codes d'erreur de l'API Geolocation en messages actionnables. */
function describeError(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'Vous avez refusé l’accès à votre position. Autorisez-la dans les réglages de votre navigateur, puis réessayez.';
    case error.POSITION_UNAVAILABLE:
      return 'Position indisponible. Vérifiez que le GPS de votre appareil est activé.';
    case error.TIMEOUT:
      return 'La localisation a pris trop de temps. Réessayez, de préférence à l’extérieur.';
    default:
      return 'Localisation impossible pour le moment.';
  }
}

/** Affichage lisible d'une coordonnée, à la précision réellement conservée. */
function formatCoordinate(value: number): string {
  return value.toFixed(3);
}

export function GeoLocationField({ latitude, longitude, onChange, error }: GeoLocationFieldProps) {
  const [isLocating, setIsLocating] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);

  const hasPosition = latitude !== null && longitude !== null;

  function locate() {
    setDeviceError(null);

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setDeviceError('Votre navigateur ne prend pas en charge la géolocalisation.');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        // Arrondi dès le client : la valeur précise ne quitte pas l'appareil.
        onChange({
          latitude: Math.round(position.coords.latitude * 1000) / 1000,
          longitude: Math.round(position.coords.longitude * 1000) / 1000,
        });
      },
      (positionError) => {
        setIsLocating(false);
        setDeviceError(describeError(positionError));
      },
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 },
    );
  }

  function clear() {
    setDeviceError(null);
    onChange({ latitude: null, longitude: null });
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-neutral-800">Localisation GPS (facultatif)</span>

      {/* Les valeurs partent au serveur par des champs cachés : le composant
          reste utilisable sans JavaScript côté soumission. */}
      <input type="hidden" name="latitude" value={latitude ?? ''} />
      <input type="hidden" name="longitude" value={longitude ?? ''} />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={locate}
          disabled={isLocating}
          aria-describedby="geo-privacy"
        >
          {isLocating ? (
            <Loader2 className="size-4.5 animate-spin" aria-hidden="true" />
          ) : (
            <Crosshair className="size-4.5" aria-hidden="true" />
          )}
          {hasPosition ? 'Actualiser ma position' : 'Utiliser ma position actuelle'}
        </Button>

        {hasPosition ? (
          <Button type="button" variant="ghost" onClick={clear}>
            <X className="size-4.5" aria-hidden="true" />
            Retirer
          </Button>
        ) : null}
      </div>

      {hasPosition ? (
        <p className="flex items-center gap-1.5 text-sm text-brand-800" aria-live="polite">
          <MapPin className="size-4 shrink-0" aria-hidden="true" />
          Position enregistrée : {formatCoordinate(latitude)}, {formatCoordinate(longitude)}
        </p>
      ) : null}

      <p id="geo-privacy" className="text-xs text-neutral-500">
        Votre position n’est conservée qu’avec une précision d’environ 110 mètres : elle situe le
        quartier, jamais votre adresse exacte. Elle aide les acheteurs proches à trouver votre
        annonce.
      </p>

      {deviceError ? (
        <p role="alert" className="text-xs font-medium text-red-600">
          {deviceError}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs font-medium text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
