/**
 * New Invoice Email Template
 *
 * Sent to recipients when a new invoice is issued.
 */

import { Section, Text, Row, Column } from '@react-email/components';
import * as React from 'react';
import {
  BaseLayout,
  Button,
  Heading,
  Paragraph,
  InfoBox,
} from './base-layout';
import type { NewInvoiceEmailProps } from '../types';

export function NewInvoiceEmail({
  recipientName,
  invoiceNumber,
  amount,
  dueDate,
  downloadUrl,
  tenantName,
  appName,
  tenantLogoUrl,
  primaryColor = '#335E99',
  currentYear = new Date().getFullYear(),
  unsubscribeUrl,
}: NewInvoiceEmailProps) {
  const brandName = appName || 'WindparkManager';
  const preview = `Neue Rechnung ${invoiceNumber} von ${brandName}`;

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
      <Heading>Neue Rechnung</Heading>

      <Paragraph>Guten Tag {recipientName},</Paragraph>

      <Paragraph>
        im Anhang erhalten Sie eine neue Rechnung von {tenantName}. Die Details
        finden Sie in der untenstehenden Übersicht.
      </Paragraph>

      <InfoBox borderColor={primaryColor}>
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
              <Text style={labelStyle}>Betrag:</Text>
            </Column>
            <Column style={valueColumnStyle}>
              <Text style={amountStyle}>{amount}</Text>
            </Column>
          </Row>
          <Row>
            <Column style={labelColumnStyle}>
              <Text style={labelStyle}>Fällig am:</Text>
            </Column>
            <Column style={valueColumnStyle}>
              <Text style={valueStyle}>{dueDate}</Text>
            </Column>
          </Row>
        </Section>
      </InfoBox>

      <Section style={{ textAlign: 'center', margin: '32px 0' }}>
        <Button href={downloadUrl} color={primaryColor}>
          Rechnung herunterladen
        </Button>
      </Section>

      <Paragraph>
        Sie können die Rechnung auch jederzeit in Ihrem Portal unter dem Bereich
        &quot;Rechnungen&quot; einsehen und herunterladen.
      </Paragraph>

      <Section style={paymentInfoStyle}>
        <Text style={paymentInfoHeaderStyle}>Zahlungshinweise</Text>
        <Text style={paymentInfoTextStyle}>
          Bitte überweisen Sie den Betrag bis zum genannten Fälligkeitsdatum
          unter Angabe der Rechnungsnummer als Verwendungszweck. Die
          Bankverbindung finden Sie auf der Rechnung.
        </Text>
      </Section>

      <Paragraph>
        Bei Fragen zu dieser Rechnung stehen wir Ihnen gerne zur Verfuegung.
      </Paragraph>

      <Paragraph>
        Mit freundlichen Gruessen,
        <br />
        Ihr {brandName} Team
      </Paragraph>
    </BaseLayout>
  );
}

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

const amountStyle = {
  fontSize: '18px',
  color: '#059669',
  fontWeight: '700' as const,
  margin: '4px 0',
};

const paymentInfoStyle = {
  backgroundColor: '#ecfdf5',
  borderRadius: '6px',
  padding: '16px 20px',
  margin: '24px 0',
};

const paymentInfoHeaderStyle = {
  fontSize: '14px',
  color: '#065f46',
  fontWeight: '600' as const,
  margin: '0 0 8px 0',
};

const paymentInfoTextStyle = {
  fontSize: '13px',
  color: '#047857',
  margin: 0,
  lineHeight: '20px',
};

export default NewInvoiceEmail;
