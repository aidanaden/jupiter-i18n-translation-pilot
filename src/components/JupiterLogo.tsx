import jupiterLogoUrl from '../../../jupusd/public/jupiter-logo.svg?url';

export const JupiterLogo: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={className}
      height={32}
      src={jupiterLogoUrl}
      width={33}
    />
  );
};
