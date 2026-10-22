/** Auth-protected area. Each role supplies its own shell (sidebar + top bar) in its own layout. */
export default function PortalLayout({ children }: LayoutProps<"/">) {
  return <div className="flex flex-1 flex-col bg-bg">{children}</div>;
}
