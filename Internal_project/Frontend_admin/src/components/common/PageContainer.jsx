/**
 * Shared page wrapper for every screen rendered inside AdminLayout.
 *
 * The layout's <main> already owns the single scroll area, so pages must never
 * set their own viewport height (min-h-screen) or nested scroll containers —
 * that is what produced the double scrollbars. Sizing and padding live here.
 */
const PageContainer = ({ children, className = '' }) => (
  <div className={`page-shell ${className}`.trim()}>{children}</div>
);

export default PageContainer;
