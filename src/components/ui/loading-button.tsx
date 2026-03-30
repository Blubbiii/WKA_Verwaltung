import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "./button";

export interface LoadingButtonProps extends ButtonProps {
  isLoading?: boolean;
  loadingText?: string;
}

const LoadingButton = React.forwardRef<HTMLButtonElement, LoadingButtonProps>(
  ({ isLoading, loadingText, children, disabled, ...props }, ref) => {
    return (
      <Button ref={ref} disabled={isLoading || disabled} {...props}>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        {isLoading && loadingText ? loadingText : children}
      </Button>
    );
  }
);
LoadingButton.displayName = "LoadingButton";

export { LoadingButton };
