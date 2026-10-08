'use client';

import Link, { useLinkStatus, type LinkProps } from 'next/link';
import { useEffect, type ReactNode } from 'react';

interface NavigationLinkProps extends LinkProps {
  children: ReactNode;
  className?: string;
  pendingClassName?: string;
  pendingLabel?: string;
}

function LinkContent({ children, className, pendingClassName = 'opacity-70', pendingLabel }: Omit<NavigationLinkProps, 'href'>) {
  const { pending } = useLinkStatus();

  useEffect(() => {
    if (pending) window.dispatchEvent(new CustomEvent('alienista:navigation-start'));
  }, [pending]);

  return <span className={`${className || ''} ${pending ? pendingClassName : ''} transition-opacity`} aria-busy={pending || undefined}>
    {children}{pendingLabel && <span className="sr-only">{pendingLabel}</span>}
  </span>;
}

export function NavigationLink({ children, ...props }: NavigationLinkProps) {
  const { pendingClassName, pendingLabel, className, ...linkProps } = props;
  return <Link {...linkProps} className={className}><LinkContent className={className} pendingClassName={pendingClassName} pendingLabel={pendingLabel}>{children}</LinkContent></Link>;
}
