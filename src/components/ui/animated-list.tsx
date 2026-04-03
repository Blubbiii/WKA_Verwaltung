"use client";

import { motion, type Variants } from "framer-motion";

/**
 * Staggered list animation — children slide in one by one.
 *
 * Usage:
 * ```tsx
 * <AnimatedList>
 *   {items.map((item) => (
 *     <AnimatedListItem key={item.id}>
 *       <Card>...</Card>
 *     </AnimatedListItem>
 *   ))}
 * </AnimatedList>
 * ```
 */

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25 },
  },
};

export function AnimatedList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedListItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={itemVariants} className={className}>
      {children}
    </motion.div>
  );
}
