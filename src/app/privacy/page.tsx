import LegalPage, { legalMetadata } from "@/components/LegalPage";

export const generateMetadata = () => legalMetadata("Privacy Policy");

export default function PrivacyPage() {
  return <LegalPage title="Privacy Policy" field="privacy" />;
}
