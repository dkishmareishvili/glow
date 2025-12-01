interface ItemProps {
  imageSrc: string;
  maxWidth?: number;
}

// ============================================================================
// REACT COMPONENT
// ============================================================================

export function Item({ imageSrc, maxWidth = 800 }: ItemProps) {
  return (
    <img
      src={imageSrc}
      alt=""
      style={{
        display: "block",
        maxWidth: maxWidth,
        width: "100%",
        borderRadius: "8px",
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
      }}
    />
  );
}
