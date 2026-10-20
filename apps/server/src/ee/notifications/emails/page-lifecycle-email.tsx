import { Section, Text } from 'react-email';
import * as React from 'react';
import { content, paragraph } from '@docmost/transactional/css/styles';
import {
  EmailButton,
  getGreetingName,
  MailBody,
} from '@docmost/transactional/partials/partials';

interface Props {
  userName: string;
  message: string;
  pageUrl: string;
  ctaLabel?: string;
}

export const PageLifecycleEmail = ({
  userName,
  message,
  pageUrl,
  ctaLabel = 'View page',
}: Props) => {
  return (
    <MailBody>
      <Section style={content}>
        <Text style={paragraph}>Hi {getGreetingName(userName)},</Text>
        <Text style={paragraph}>{message}</Text>
      </Section>
      <EmailButton href={pageUrl}>{ctaLabel}</EmailButton>
    </MailBody>
  );
};

export default PageLifecycleEmail;
