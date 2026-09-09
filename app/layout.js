import "./globals.css";

export const metadata = {
  title: "Content AI Studio",
  description: "AI tools for social media, design and freelance work",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
