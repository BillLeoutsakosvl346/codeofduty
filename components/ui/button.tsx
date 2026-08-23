import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap border text-xs font-black uppercase tracking-[0.13em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b8ff38] disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        default: 'border-[#b8ff38] bg-[#b8ff38] text-[#071008] hover:bg-[#ceff77]',
        outline: 'border-white/15 bg-white/[0.025] text-white hover:border-white/30 hover:bg-white/[0.06]',
        danger: 'border-[#ff7557]/45 bg-[#ff7557]/10 text-[#ff9078] hover:bg-[#ff7557]/20',
        ghost: 'border-transparent text-white/55 hover:bg-white/5 hover:text-white',
      },
      size: { default: 'h-10 px-4', sm: 'h-8 px-3 text-[10px]', lg: 'h-12 px-6' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export function Button({ className, variant, size, asChild = false, ...props }: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
