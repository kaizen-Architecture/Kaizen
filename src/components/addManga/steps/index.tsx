import { createStyles, Stepper } from '@mantine/core';
import { UseFormReturnType } from '@mantine/form';
import { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'next-i18next';
import { getCronLabel } from '../../../utils';
import type { FormType } from '../form';
import { DownloadStep } from './downloadStep';
import { ReviewStep } from './reviewStep';
import { SearchStep } from './searchStep';
import { SourceStep } from './sourceStep';

const useStyles = createStyles((_theme) => ({
  stepper: {
    flexGrow: 1,
  },
  stepBody: {
    marginTop: 30,
    marginBottom: 30,
  },
  buttonGroup: {
    position: 'fixed',
    bottom: '19px',
    right: '55px',
    width: 'calc(100% - 55px)',
    height: '50px',
    background: 'white',
  },
}));

export default function AddMangaSteps({
  form,
  active,
  setActive,
}: {
  form: UseFormReturnType<FormType>;
  active: number;
  setActive: Dispatch<SetStateAction<number>>;
}) {
  const { classes } = useStyles();
  const { t } = useTranslation(['common']);

  return (
    <Stepper
      classNames={{
        root: classes.stepper,
        content: classes.stepBody,
      }}
      active={active}
      onStepClick={setActive}
      breakpoint="sm"
      m="xl"
    >
      <Stepper.Step
        label={t('common:addManga.steps.source', 'Source')}
        description={
          Array.isArray(form.values.source)
            ? form.values.source.includes('all') || form.values.source.length > 3
              ? t('common:addManga.steps.activeSourcesCount', {
                  count: form.values.source.length,
                  defaultValue: `${form.values.source.length} active sources`,
                })
              : form.values.source.join(', ')
            : form.values.source || t('common:addManga.steps.selectSource', 'Select a source')
        }
        allowStepSelect={false}
        color={active > 0 ? 'teal' : 'indigo'}
      >
        <SourceStep form={form} />
      </Stepper.Step>
      <Stepper.Step
        label={t('common:addManga.steps.manga', 'Manga')}
        description={form.values.mangaTitle || t('common:addManga.steps.searchManga', 'Search for manga')}
        allowStepSelect={false}
        color={active > 1 ? 'teal' : 'indigo'}
      >
        <SearchStep form={form} initialTitle={form.values.query} />
      </Stepper.Step>
      <Stepper.Step
        label={t('common:addManga.steps.download', 'Download')}
        description={
          form.values.interval
            ? getCronLabel(form.values.interval)
            : t('common:addManga.steps.selectInterval', 'Select an interval')
        }
        allowStepSelect={false}
        color={active > 2 ? 'teal' : 'indigo'}
      >
        <DownloadStep form={form} />
      </Stepper.Step>

      <Stepper.Completed>
        <ReviewStep form={form} />
      </Stepper.Completed>
    </Stepper>
  );
}
