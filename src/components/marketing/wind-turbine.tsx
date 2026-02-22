export function WindTurbineAnimation() {
  return (
    <div
      className="relative h-64 w-64 md:h-96 md:w-96 flex items-center justify-center"
      role="img"
      aria-label="Animierte Windkraftanlage"
    >
      {/* Mast */}
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 h-1/2 w-4 bg-foreground/20 rounded-t-lg"
      />

      {/* Rotor */}
      <div className="animate-[spin_4s_linear_infinite] origin-center z-10 w-full h-full">
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full fill-primary drop-shadow-xl"
          aria-hidden="true"
        >
          <circle cx="50" cy="50" r="5" />
          {/* Blade 1 — up */}
          <path d="M50 50 L45 10 C45 10 55 10 50 50 Z" />
          {/* Blade 2 — lower right */}
          <path d="M50 50 L85 80 C85 80 75 88 50 50 Z" />
          {/* Blade 3 — lower left */}
          <path d="M50 50 L15 80 C15 80 25 88 50 50 Z" />
        </svg>
      </div>

      {/* Clouds */}
      <svg
        className="absolute top-10 right-10 animate-[bounce_3s_infinite] text-muted-foreground/50"
        width="60"
        height="30"
        viewBox="0 0 60 30"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M10,25 Q20,10 30,25 T50,25"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
      <svg
        className="absolute top-20 left-10 animate-[bounce_4s_infinite_0.7s] text-muted-foreground/30"
        width="40"
        height="20"
        viewBox="0 0 40 20"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M5,15 Q15,5 25,15 T35,15"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}
