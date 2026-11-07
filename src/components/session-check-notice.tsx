import Link from "next/link";

export function SessionCheckNotice({ retryHref }: { retryHref: string }) {
  return (
    <section className="session-check-notice" role="alert" aria-live="polite">
      <div>
        <h2>Sesi belum dapat diperiksa</h2>
        <p>Terjadi gangguan sementara saat memeriksa sesi. Kami tidak mengubah sesi Anda. Silakan coba lagi sebentar.</p>
      </div>
      <Link className="button button--secondary" href={retryHref}>Coba periksa lagi</Link>
    </section>
  );
}
