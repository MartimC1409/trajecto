import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ConfirmButtonProps {
  readonly label: string;
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
  readonly disabled?: boolean;
}

/** Botão em dois passos para ações destrutivas (apagar dados). */
export function ConfirmButton({ label, confirmLabel, onConfirm, disabled }: ConfirmButtonProps) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        className="button danger"
        disabled={disabled}
        onClick={() => setConfirming(true)}
      >
        {label}
      </button>
    );
  }
  return (
    <span className="confirm-group">
      <button
        type="button"
        className="button danger solid"
        // O foco passa para o botão de confirmação para quem usa teclado ou leitor de ecrã.
        autoFocus
        onClick={() => {
          setConfirming(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </button>
      <button type="button" className="button" onClick={() => setConfirming(false)}>
        {t('settings.cancel')}
      </button>
    </span>
  );
}
