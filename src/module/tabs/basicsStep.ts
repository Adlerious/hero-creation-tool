import { Step, StepEnum } from '../step';
import InputOption from '../options/inputOption';
import { MYSTERY_MAN } from '../constants';

const enum ImgType {
  AVATAR = 'avatar',
  TOKEN = 'token',
}

function flashBorder(element: JQuery): void {
  element.css('border', '2px solid green'); // Highlight with a green border
  setTimeout(() => {
    element.css('border', ''); // Remove the border after a short delay
  }, 1000); // 1000 milliseconds = 1 second
}

class _Basics extends Step {
  constructor() {
    super(StepEnum.Basics);
  }

  section = () => $('#basicsDiv');

  avatarOption!: InputOption;
  tokenOption!: InputOption;
  nameOption!: InputOption;

  fileChangedCallback(type: ImgType, path: string): void {
    const $input = type === ImgType.AVATAR ? this.avatarOption.$elem : this.tokenOption.$elem;
    const $img = $(`[data-img=${type}]`);

    $input.val(path);
    $img.attr('src', path);
    flashBorder($img);
  }

  setListeners(): void {
    $('[data-filepick]', this.section()).on('click', (event) => {
      const pick = $(event.target).data('filepick');
      this.openFilePicker(pick);
    });
  };
  
  renderData(data: { actorName?: string }): void {
    this.clearOptions();
    this.nameOption = new InputOption(
      this.step,
      'name',
      game.i18n.localize('HCT.Common.RequiredName'),
      data?.actorName ?? '',
    );

    this.nameOption.render($('[data-hero_name] div', this.section()));

    this.avatarOption = new InputOption(this.step, 'img', MYSTERY_MAN, MYSTERY_MAN);
    this.avatarOption.render($('[data-hero_avatar] div', this.section()));

    this.tokenOption = new InputOption(this.step, 'token.img', MYSTERY_MAN, MYSTERY_MAN);
    this.tokenOption.render($('[data-hero_token] div', this.section()));

    this.stepOptions.push(this.nameOption, this.avatarOption, this.tokenOption);
  }

  openFilePicker(input: string) {
    const path1 = '/';
    const type: ImgType = input === 'avatar' ? ImgType.AVATAR : ImgType.TOKEN;
    const fp2 = new FilePicker({
      type: 'image',
      current: path1,
      callback: (path: string) => this.fileChangedCallback(type, path),
    } as any);
    fp2.browse('');
  }
}

const BasicsTab: Step = new _Basics();
export default BasicsTab;