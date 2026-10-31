import { render, screen } from '@testing-library/react-native';

import Index from '../../src/app/index';

describe('Index screen', () => {
  it('renders the app name', async () => {
    await render(<Index />);
    expect(screen.getByText('Snapshelf')).toBeTruthy();
  });
});
