<script>
    import { i18n } from "../../../shared/utils";

    export let onSave = function () {};;
</script>

    <label class="fn__flex b3-label config__item">
      <div class="fn__flex-1">
      <input
        id="template-name"
        class="b3-text-field fn__flex-center fn__size200"
      />
    </label>
    <!-- <div class="button-group" style={{float: 'right', margin: '20px 0 10px'}}> -->
        <div class="button-group" style="float: right;margin: 20px 0 10px;">
      <button id="saveDraw" class="b3-button" on:click={onSave}>
        {i18n.settingsTab.items.templateDialog.save}
      </button>
    </div>
