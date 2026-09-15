import { QRCodeSVG } from "qrcode.react";
import { GAME_NAME, SEAT_COUNT, WIFI_NAME } from "../config.js";
import { EMPTY_IDENTITY, decoratePlayers, seatStatus } from "../lib/identity.js";
import { CheckerStrip, Pill, StickerButton } from "../components/primitives.jsx";

export function JoinScreen({ room, roomId, joinUrl, hostAction }) {
  const players = decoratePlayers(room);
  const emptySeats = Math.max(0, SEAT_COUNT - players.length);
  const dense = players.length > SEAT_COUNT;
  const seatsLabel = players.length <= SEAT_COUNT
    ? `SEATS — ${players.length} OF ${SEAT_COUNT} FILLED`
    : `SEATS — ${players.length} DRIVERS IN`;

  return (
    <div className="tv-screen tv-join">
      <CheckerStrip className="tv-join__strip" />

      <section className="tv-join__left">
        <div className="tv-join__circle" aria-hidden="true" />
        <div className="tv-join__ground" aria-hidden="true" />
        <div className="tv-join__top">
          <div className="tv-join__pills">
            <Pill tone="red" className="tv-pill tv-pill--loose">Party mode · {SEAT_COUNT} seats</Pill>
            <Pill tone="cream" className="tv-pill tv-pill--loose">Wi-Fi · {WIFI_NAME}</Pill>
          </div>
          <h1 className="tv-wordmark">{GAME_NAME}</h1>
          <p className="tv-join__lede">
            Scan the code. Your phone is the garage and the steering wheel.
          </p>
        </div>
        <div className="tv-join__bottom">
          <div className="tv-join__code">
            <span className="tv-label">ROOM CODE</span>
            <span className="tv-join__chip">{roomId}</span>
          </div>
          <p className="tv-join__url">
            or open
            <br />
            <b>{joinUrl}</b>
            <br />
            <span className="tv-join__url-muted">
              {room.defectsEnabled === false ? "arcade mode" : `garage · ${room.selectorName}`}
            </span>
          </p>
        </div>
      </section>

      <section className="tv-join__right">
        <div className="tv-join__qr-block">
          <div className="tv-join__qr">
            <QRCodeSVG value={joinUrl} size={300} level="M" fgColor="#141210" bgColor="#ffffff" marginSize={0} />
          </div>
          <span className="tv-caption">POINT YOUR CAMERA HERE</span>
        </div>
        <div className="tv-join__seats">
          <span className="tv-caption">{seatsLabel}</span>
          <ul className={`tv-seat-list ${dense ? "tv-seat-list--dense" : ""}`}>
            {players.map((player) => (
              <li className="tv-seat" key={player.id}>
                <span className="tv-seat__dot" style={{ background: player.identity.color }} />
                <span className="tv-seat__name">{player.name}</span>
                <span className="tv-seat__tag">{seatStatus(player)}</span>
              </li>
            ))}
            {Array.from({ length: emptySeats }, (_, index) => (
              <li className="tv-seat tv-seat--empty" key={`empty-${index}`}>
                <span className="tv-seat__dot" style={{ background: EMPTY_IDENTITY.color }} />
                <span className="tv-seat__name">Open seat</span>
                <span className="tv-seat__tag">SCAN TO JOIN</span>
              </li>
            ))}
          </ul>
          {hostAction ? (
            <StickerButton
              className="tv-button tv-button--wide"
              type="button"
              disabled={hostAction.disabled}
              onClick={hostAction.run}
            >
              {hostAction.label}
            </StickerButton>
          ) : null}
        </div>
      </section>
    </div>
  );
}
