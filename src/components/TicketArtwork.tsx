import type { TicketField, TicketFieldKey } from "@/lib/ticket-template";

export type TicketFieldValues = Partial<Record<TicketFieldKey, string>>;

// Renders a tenant-designed ticket: their artwork with the printed fields
// positioned on top of it. Deliberately a pure presentational component with
// no hooks or data access, so the public ticket page (server) and the
// designer (client) render through EXACTLY the same code — what the tenant
// arranges is what the attendee receives, with no second implementation to
// drift.
//
// The whole layout is resolution-independent: `container-type: inline-size`
// plus `cqw` sizing means one stored layout renders identically on a phone,
// a desktop, or a printed page, with no breakpoints and no stored pixel values.
export default function TicketArtwork({
  artworkUrl,
  fields,
  values,
  qrDataUrl,
  className = "",
}: {
  artworkUrl: string;
  fields: TicketField[];
  values: TicketFieldValues;
  qrDataUrl?: string | null;
  className?: string;
}) {
  return (
    <div
      className={`relative w-full overflow-hidden ${className}`}
      style={{ containerType: "inline-size" }}
    >
      {/* The artwork sets the box's aspect ratio simply by being in normal
          flow at width:100% — that's why no aspect ratio is stored anywhere. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- tenant artwork from arbitrary storage backends (S3/Blob/local); next/image would need per-deployment remotePatterns config to work at all */}
      <img src={artworkUrl} alt="" className="block w-full" />

      {fields.map((field) => {
        const common: React.CSSProperties = {
          position: "absolute",
          left: `${field.x}%`,
          top: `${field.y}%`,
          transform: "translate(-50%, -50%)",
        };

        if (field.key === "qr") {
          return (
            <div
              key={field.key}
              style={{ ...common, width: `${field.size}cqw` }}
              // The white pad is NOT cosmetic and is not affected by the
              // light/dark setting: QR scanners need both high contrast and a
              // quiet zone, and a code printed straight onto busy artwork
              // fails at the gate.
              className="rounded-sm bg-white p-[1.5cqw] shadow-sm"
            >
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- inline data: URI; next/image adds nothing
                <img src={qrDataUrl} alt="Ticket QR code" className="block w-full" />
              ) : (
                <div className="aspect-square w-full rounded-sm bg-slate-200" />
              )}
            </div>
          );
        }

        const text = values[field.key];
        if (!text) return null;
        return (
          <div
            key={field.key}
            style={{
              ...common,
              fontSize: `${field.size}cqw`,
              // Long values (a long event name, a long attendee name) are
              // clipped with an ellipsis rather than allowed to overflow the
              // artwork or wrap unpredictably into other fields.
              maxWidth: "92%",
              color: field.color === "light" ? "#ffffff" : "#0f172a",
              textShadow:
                field.color === "light"
                  ? "0 1px 3px rgba(0,0,0,0.55)"
                  : "0 1px 2px rgba(255,255,255,0.45)",
            }}
            className="overflow-hidden text-ellipsis whitespace-nowrap text-center font-semibold leading-tight"
          >
            {text}
          </div>
        );
      })}
    </div>
  );
}
