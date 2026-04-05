import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-[#01696f] text-white',
        secondary: 'border-transparent bg-gray-100 text-gray-800',
        destructive: 'border-transparent bg-red-500 text-white',
        outline: 'text-[#1a1a1a]',
        outstanding: 'border-transparent bg-[#437a22] text-white',
        good: 'border-transparent bg-[#006494] text-white',
        satisfactory: 'border-transparent bg-[#d19900] text-white',
        unsatisfactory: 'border-transparent bg-[#da7101] text-white',
        nui: 'border-transparent bg-[#a12c7b] text-white',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
