import { Badge, createStyles, Group, Image, ScrollArea, SimpleGrid, Stack, Text, UnstyledButton } from '@mantine/core';
import { useUncontrolled } from '@mantine/hooks';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useTranslation } from 'next-i18next';

const useStyles = createStyles((theme, { checked, disabled }: { checked: boolean; disabled: boolean }) => {
  return {
    button: {
      display: 'flex',
      alignItems: 'flex-start',
      width: '100%',
      transition: 'all 200ms ease',
      border: `1px solid ${
        checked
          ? theme.fn.variant({ variant: 'outline', color: theme.primaryColor }).border
          : theme.colorScheme === 'dark'
          ? theme.colors.dark[5]
          : theme.colors.gray[2]
      }`,
      borderRadius: theme.radius.md,
      padding: theme.spacing.sm,
      backgroundColor: checked
        ? theme.colorScheme === 'dark'
          ? theme.fn.rgba(theme.colors[theme.primaryColor][9], 0.15)
          : theme.fn.rgba(theme.colors[theme.primaryColor][0], 0.5)
        : theme.colorScheme === 'dark'
        ? theme.colors.dark[6]
        : theme.white,
      opacity: disabled && !checked ? 0.6 : 1,
      filter: disabled && !checked ? 'grayscale(0.5)' : 'none',
      cursor: disabled ? 'not-allowed' : 'pointer',
      boxShadow: checked ? theme.shadows.md : theme.shadows.xs,
      '&:hover': {
        backgroundColor: disabled
          ? undefined
          : theme.colorScheme === 'dark'
          ? theme.colors.dark[5]
          : theme.colors.gray[0],
        transform: disabled ? 'none' : 'translateY(-2px)',
        borderColor: checked ? undefined : theme.colors.gray[4],
      },
    },

    imageContainer: {
      position: 'relative',
      borderRadius: theme.radius.sm,
      overflow: 'hidden',
      boxShadow: theme.shadows.sm,
    },

    body: {
      flex: 1,
      marginLeft: theme.spacing.md,
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    },

    glass: {
      backdropFilter: 'blur(8px)',
      backgroundColor:
        theme.colorScheme === 'dark' ? theme.fn.rgba(theme.colors.dark[7], 0.6) : theme.fn.rgba(theme.white, 0.6),
    },
  };
});

interface ImageCheckboxProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?(checked: boolean): void;
  title: string;
  description: string;
  image: string;
  source: string;
  chapters: number;
}

export function ImageCheckbox({
  checked,
  defaultChecked,
  onChange,
  title,
  description,
  className,
  disabled,
  image,
  source,
  chapters,
  ...others
}: ImageCheckboxProps & Omit<React.ComponentPropsWithoutRef<'button'>, keyof ImageCheckboxProps>) {
  const { t } = useTranslation(['common']);
  const [value, handleChange] = useUncontrolled({
    value: checked,
    defaultValue: defaultChecked,
    finalValue: false,
    onChange,
  });

  const { classes, cx } = useStyles({ checked: value, disabled: disabled || false });

  return (
    <motion.div
      whileHover={!disabled ? { scale: 1.02 } : {}}
      whileTap={!disabled ? { scale: 0.98 } : {}}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <UnstyledButton
        {...others}
        onClick={() => {
          if (!disabled) {
            handleChange(!value);
          }
        }}
        className={cx(classes.button, className)}
      >
        <div className={classes.imageContainer}>
          <Image
            withPlaceholder
            placeholder={<Image src="/cover-not-found.jpg" alt={title} width={70} height={105} />}
            src={image}
            width={70}
            height={105}
            radius="sm"
          />
        </div>

        <div className={classes.body}>
          <Group position="apart" align="flex-start" noWrap>
            <Stack spacing={2} sx={{ flex: 1 }}>
              <Text weight={700} size="sm" lineClamp={2} sx={{ lineHeight: 1.2 }}>
                {title}
              </Text>
              <Text color="dimmed" size="xs">
                {source}
              </Text>
            </Stack>
            <Badge size="xs" variant="dot" color={description?.toLowerCase() === 'finished' ? 'teal' : 'indigo'}>
              {description || 'Unknown'}
            </Badge>
          </Group>

          <Group spacing={8} mt="auto">
            <Badge size="xs" variant="filled" color="gray">
              {t('common:addManga.search.chaptersCount', { count: chapters, defaultValue: `${chapters} chapters` })}
            </Badge>
            {value && (
              <Badge size="xs" variant="filled" color={checked ? 'indigo' : 'gray'}>
                {t('common:addManga.search.selected', 'Selected')}
              </Badge>
            )}
          </Group>
        </div>
      </UnstyledButton>
    </motion.div>
  );
}

ImageCheckbox.defaultProps = {
  checked: undefined,
  defaultChecked: undefined,
  onChange: () => {},
};

type IMangaSearchResult = {
  status: string;
  title: string;
  cover: string;
  source: string;
  chapters: number;
};

export function MangaSearchResult({
  items,
  onSelect,
  onMultiSelect,
}: {
  items: IMangaSearchResult[];
  onSelect: (selected: IMangaSearchResult | undefined) => void;
  onMultiSelect?: (selectedList: IMangaSearchResult[]) => void;
}) {
  const [selectedList, setSelectedList] = useState<IMangaSearchResult[]>([]);

  useEffect(() => {
    setSelectedList([]);
  }, [items]);

  return (
    <ScrollArea.Autosize maxHeight={450} pr="md">
      <SimpleGrid
        cols={2}
        spacing="md"
        breakpoints={[
          { maxWidth: 'md', cols: 2 },
          { maxWidth: 'sm', cols: 1 },
        ]}
      >
        <AnimatePresence>
          {items.map((m) => {
            const isSelected = selectedList.some((s) => s.source === m.source && s.title === m.title);
            const isDisabled = selectedList.length > 0 && selectedList[0] && m.title !== selectedList[0].title;

            return (
              <ImageCheckbox
                key={`${m.source}-${m.title}`}
                image={m.cover || '/cover-not-found.jpg'}
                title={m.title}
                disabled={isDisabled}
                checked={isSelected}
                description={m.status}
                source={m.source}
                chapters={m.chapters}
                onChange={(checked) => {
                  let nextList;
                  if (checked) {
                    nextList = [...selectedList, m];
                  } else {
                    nextList = selectedList.filter((s) => !(s.source === m.source && s.title === m.title));
                  }
                  setSelectedList(nextList);
                  if (onMultiSelect) {
                    onMultiSelect(nextList);
                  }
                  onSelect(nextList[0]);
                }}
              />
            );
          })}
        </AnimatePresence>
      </SimpleGrid>
    </ScrollArea.Autosize>
  );
}

MangaSearchResult.defaultProps = {
  onMultiSelect: () => {},
};
