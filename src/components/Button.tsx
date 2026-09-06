import React from 'react';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
};
export function Button({ variant = 'secondary', className = '', type = 'button', ...props }: Props) {
  return <button type={type} className={`ui-button ui-button--${variant} ${className}`} {...props} />;
}
