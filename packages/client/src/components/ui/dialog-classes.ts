export const DIALOG_CONTENT_CLASSES = {
  base: 'fixed z-50 grid gap-4 bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
  mobile:
    'inset-0 w-full h-full overflow-y-auto overscroll-contain rounded-none border-none safe-area-top safe-area-bottom',
  mobileAnimation:
    'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom sm:data-[state=closed]:slide-out-to-left-1/2 sm:data-[state=closed]:slide-out-to-top-[48%] sm:data-[state=open]:slide-in-from-left-1/2 sm:data-[state=open]:slide-in-from-top-[48%]',
  desktop:
    'sm:inset-auto sm:left-[50%] sm:top-[50%] sm:h-auto sm:w-full sm:max-w-lg sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg sm:border sm:overflow-visible sm:overscroll-auto',
  desktopAnimation: 'sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95',
};
