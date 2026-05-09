/* expo-router type augmentation */
declare module 'expo-router' {
  import { ComponentType } from 'react';

  export function useRouter(): {
    push: (href: string) => void;
    replace: (href: string) => void;
    back: () => void;
  };
  export function useLocalSearchParams<T extends Record<string, string>>(): T;
  export function useGlobalSearchParams<T extends Record<string, string>>(): T;
  export function usePathname(): string;

  export const router: {
    push: (href: string) => void;
    replace: (href: string) => void;
    back: () => void;
  };

  export function Redirect(props: { href: string }): null;

  export function Link(props: {
    href: string;
    asChild?: boolean;
    children?: React.ReactNode;
  }): React.ReactElement;

  interface ScreenProps {
    name?: string;
    options?: Record<string, unknown>;
    redirect?: string;
  }

  interface StackProps {
    screenOptions?: Record<string, unknown>;
    children?: React.ReactNode;
  }

  interface TabsProps {
    screenOptions?: Record<string, unknown>;
    children?: React.ReactNode;
  }

  type StackComponent = ComponentType<StackProps> & {
    Screen: ComponentType<ScreenProps>;
  };

  type TabsComponent = ComponentType<TabsProps> & {
    Screen: ComponentType<{
      name?: string;
      options?: Record<string, unknown>;
    }>;
  };

  export const Stack: StackComponent;
  export const Tabs: TabsComponent;
  export function Slot(): React.ReactElement;
}

declare module 'expo-router/entry' {}
