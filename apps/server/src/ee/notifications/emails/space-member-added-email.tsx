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
  actorName: string;
  spaceName: string;
  spaceUrl: string;
}

export const SpaceMemberAddedEmail = ({
  userName,
  actorName,
  spaceName,
  spaceUrl,
}: Props) => {
  return (
    <MailBody>
      <Section style={content}>
        <Text style={paragraph}>Hi {getGreetingName(userName)},</Text>
        <Text style={paragraph}>
          <strong>{actorName}</strong> added you to the{' '}
          <strong>{spaceName}</strong> space.
        </Text>
      </Section>
      <EmailButton href={spaceUrl}>Open space</EmailButton>
    </MailBody>
  );
};

export default SpaceMemberAddedEmail;
