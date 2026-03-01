/**
 * Invoice Reminder / Dunning Email Template
 *
 * Level 1: Friendly payment reminder (Zahlungserinnerung)
 * Level 2: Formal first dunning notice (1. Mahnung)
 * Level 3: Final notice (2. / letzte Mahnung)
 */

import { Section, Text, Row, Column } from '@react-email/components';
import * as React from 'react';
import {
  BaseLayout,
  Heading,
  Paragraph,
  InfoBox,
} from './base-layout';
import type { InvoiceReminderEmailProps } from '../types';

export function InvoiceReminderEmail({
  recipientName,
  invoiceNumber,
  amount,
  dueDate,
  daysOverdue,
  reminderLevel,
  reminderLabel,
  lateFee,
  tenantName,
  appName,
  tenantLogoUrl,
  primaryColor = '#335E99',
  currentYear = new Date().getFullYear(),
  unsubscribeUrl,
}: InvoiceReminderEmailProps) {
  const brandName = appName || 'WindparkManager';
  const preview = `${reminderLabel} für Rechnung ${invoiceNumber} — ${daysOverdue} Tage überfällig`;

  // Color and tone vary by level
  const accentColor =
    reminderLevel === 1 ? '#335E99' : reminderLevel === 2 ? '#d97706' : '#dc2626';
  const borderColor =
    reminderLevel === 1 ? primaryColor : reminderLevel === 2 ? '#d97706' : '#dc2626';

  return (
    <BaseLayout
      preview={preview}
      tenantName={tenantName}
      appName={brandName}
      tenantLogoUrl={tenantLogoUrl}
      primaryColor={primaryColor}
      currentYear={currentYear}
      unsubscribeUrl={unsubscribeUrl}
    >
      <Heading>{reminderLabel}</Heading>

      <Paragraph>Guten Tag {recipientName},</Paragraph>

      {reminderLevel === 1 && (
        <Paragraph>
          wir möchten Sie freundlich daran erinnern, dass folgende Rechnung
          noch nicht beglichen wurde. Möglicherweise hat die Zahlung unsere
          Buchhaltung noch nicht erreicht — in diesem Fall bitten wir Sie,
          dieses Schreiben als gegenstandslos zu betrachten.
        </Paragraph>
      )}

      {reminderLevel === 2 && (
        <Paragraph>
          leider haben wir trotz unserer Zahlungserinnerung noch keinen
          Zahlungseingang für folgende Rechnung verzeichnen können. Wir
          bitten Sie, die ausstehende Zahlung umgehend vorzunehmen.
        </Paragraph>
      )}

      {reminderLevel === 3 && (
        <Paragraph>
          trotz unserer vorherigen Mahnungen ist die folgende Rechnung weiterhin
          offen. Dies ist unsere letzte Aufforderung zur Zahlung. Bei
          Nichtbegleichung innerhalb der gesetzten Frist behalten wir uns
          weitere rechtliche Schritte vor.
        </Paragraph>
      )}

      <InfoBox borderColor={borderColor}>
        <Section>
          <Row>
            <Column style={labelColumnStyle}>
              <Text style={labelStyle}>Rechnungsnummer:</Text>
            </Column>
            <Column style={valueColumnStyle}>
              <Text style={valueStyle}>{invoiceNumber}</Text>
            </Column>
          </Row>
          <Row>
            <Column style={labelColumnStyle}>
              <Text style={labelStyle}>Offener Betrag:</Text>
            </Column>
            <Column style={valueColumnStyle}>
              <Text style={{ ...valueStyle, color: accentColor, fontSize: '18px', fontWeight: '700' }}>
                {amount}
              </Text>
            </Column>
          </Row>
          <Row>
            <Column style={labelColumnStyle}>
              <Text style={labelStyle}>Fällig seit:</Text>
            </Column>
            <Column style={valueColumnStyle}>
              <Text style={valueStyle}>
                {dueDate} ({daysOverdue} Tage überfällig)
              </Text>
            </Column>
          </Row>
          {lateFee > 0 && (
            <Row>
              <Column style={labelColumnStyle}>
                <Text style={labelStyle}>Mahngebühr:</Text>
              </Column>
              <Column style={valueColumnStyle}>
                <Text style={valueStyle}>
                  {lateFee.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                </Text>
              </Column>
            </Row>
          )}
        </Section>
      </InfoBox>

      {lateFee > 0 && (
        <Section style={feeNoteStyle}>
          <Text style={feeNoteTextStyle}>
            Bitte überweisen Sie den Rechnungsbetrag zuzüglich der Mahngebühr
            von{' '}
            {lateFee.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}{' '}
            unter Angabe der Rechnungsnummer als Verwendungszweck.
          </Text>
        </Section>
      )}

      {lateFee === 0 && (
        <Paragraph>
          Bitte überweisen Sie den ausstehenden Betrag umgehend unter Angabe
          der Rechnungsnummer als Verwendungszweck. Die Bankverbindung finden
          Sie auf der beigefügten Rechnung.
        </Paragraph>
      )}

      {reminderLevel < 3 && (
        <Paragraph>
          Sollte die Zahlung bereits veranlasst worden sein, bitten wir Sie,
          dieses Schreiben als gegenstandslos zu betrachten. Bei Fragen stehen
          wir Ihnen gerne zur Verfügung.
        </Paragraph>
      )}

      {reminderLevel === 3 && (
        <Paragraph>
          Sollten Sie Zahlungsschwierigkeiten haben, setzen Sie sich bitte
          umgehend mit uns in Verbindung. Bei bereits erfolgter Zahlung bitten
          wir Sie, dieses Schreiben zu ignorieren.
        </Paragraph>
      )}

      <Paragraph>
        Mit freundlichen Grüßen,
        <br />
        Ihr {brandName} Team
      </Paragraph>
    </BaseLayout>
  );
}

// =============================================================================
// Styles
// =============================================================================

const labelColumnStyle = {
  width: '40%',
};

const valueColumnStyle = {
  width: '60%',
};

const labelStyle = {
  fontSize: '14px',
  color: '#6b7280',
  margin: '4px 0',
};

const valueStyle = {
  fontSize: '14px',
  color: '#1f2937',
  fontWeight: '500' as const,
  margin: '4px 0',
};

const feeNoteStyle = {
  backgroundColor: '#fff7ed',
  borderRadius: '6px',
  padding: '14px 18px',
  margin: '20px 0',
  borderLeft: '3px solid #d97706',
};

const feeNoteTextStyle = {
  fontSize: '13px',
  color: '#92400e',
  margin: 0,
  lineHeight: '20px',
};

export default InvoiceReminderEmail;
