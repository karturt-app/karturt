import { DeviceDataReset } from "@/components/device-data-reset";
import { ThemeToggle } from "@/components/theme-toggle";
import { InstallApp } from "@/components/install-app";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <details className="site-footer-details">
        <summary>Bantuan &amp; pengaturan</summary>
        <div className="site-footer-content">
          <p>Data iuran dikelola oleh pengurus RT Anda.</p>
          <div className="footer-actions">
            <ThemeToggle />
            <DeviceDataReset />
          </div>
          <InstallApp />
        </div>
      </details>
    </footer>
  );
}
