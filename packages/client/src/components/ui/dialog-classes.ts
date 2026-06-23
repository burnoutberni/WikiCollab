export const DIALOG_CONTENT_CLASSES = {
  base: 'fixed z-50 flex flex-col gap-4 bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
  mobile:
    'inset-0 w-full h-full overflow-y-auto overscroll-contain rounded-none border-none',
  mobileAnimation:
    'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom md:data-[state=closed]:slide-out-to-left-1/2 md:data-[state=closed]:slide-out-to-top-[48%] md:data-[state=open]:slide-in-from-left-1/2 md:data-[state=open]:slide-in-from-top-[48%]',
  desktop:
    'md:inset-auto md:left-[50%] md:top-[50%] md:h-auto md:w-full md:max-w-lg md:translate-x-[-50%] md:translate-y-[-50%] md:rounded-lg md:border md:overflow-visible md:overscroll-auto md:grid md:grid-rows-[auto_1fr_auto]',
  desktopAnimation: 'md:data-[state=closed]:zoom-out-95 md:data-[state=open]:zoom-in-95',
};
