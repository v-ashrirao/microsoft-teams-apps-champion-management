import * as React from "react";
import { sp } from "@pnp/sp";
import "@pnp/sp/webs";
import "@pnp/sp/lists";
import "@pnp/sp/items";
import { Label } from "@fluentui/react/lib/Label";
import Media from "react-bootstrap/Media";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import "bootstrap/dist/css/bootstrap.min.css";
import styles from "../scss/TOTLandingPage.module.scss";
import siteconfig from "../config/siteconfig.json";
import commonServices from "../Common/CommonServices";
import * as stringsConstants from "../constants/strings";
import TOTLeaderBoard from "./TOTLeaderBoard";
import TOTMyDashboard from "./TOTMyDashboard";
import TOTCreateTournament from "./TOTCreateTournament";
import TOTEnableTournament from "./TOTEnableTournament";
import Navbar from "react-bootstrap/Navbar";
import * as LocaleStrings from 'ClbHomeWebPartStrings';
import DigitalBadge from "./DigitalBadge";
import { ThemeStyle } from "msteams-ui-styles-core";
import { Spinner, SpinnerSize } from "@fluentui/react";
import TOTReport from "./TOTReport";

export interface ITOTLandingPageProps {
  context?: any;
  siteUrl: string;
  isTOTEnabled: boolean;
}
interface ITOTLandingPageState {
  showSuccess: Boolean;
  showError: Boolean;
  errorMessage: string;
  dashboard: boolean;
  siteUrl: string;
  siteName: string;
  inclusionpath: string;
  leaderBoard: boolean;
  createTournament: boolean;
  manageTournament: boolean;
  isAdmin: boolean;
  isShowLoader: boolean;
  digitalBadge: boolean;
  spinnerMessage: string;
  tournamentReport: boolean;

}
let commonService: commonServices;
class TOTLandingPage extends React.Component<
  ITOTLandingPageProps,
  ITOTLandingPageState
> {
  constructor(props: ITOTLandingPageProps, state: ITOTLandingPageState) {
    super(props);
    this.state = {
      showSuccess: false,
      showError: false,
      errorMessage: "",
      dashboard: false,
      siteUrl: "",
      siteName: siteconfig.sitename,
      inclusionpath: siteconfig.inclusionPath,
      createTournament: false,
      manageTournament: false,
      leaderBoard: false,
      isAdmin: false,
      isShowLoader: true,
      digitalBadge: false,
      spinnerMessage: "",
      tournamentReport: false,
    };
    commonService = new commonServices(this.props.context, this.props.siteUrl);
    this.redirectTotHome = this.redirectTotHome.bind(this);
  }
  public componentDidMount() {
    this.initialChecks();
  }
  //verify isTOTEnabled props(from clb home), if already enabled then check admin role and active tournaments
  //else run provisioning code 
  private async initialChecks() {
    try {
      //if isTOTEnabled is true then just check for role else run provisioning to add missing lists and fields
      if (this.props.isTOTEnabled == true) {
        this.checkUserRole();
      }
      else {
        this.setState({
          spinnerMessage: LocaleStrings.SpinnerListCreationMessage
        });
        //verify tot lists/fields are present, create missing lists/fields
        await this.provisionTOTListsAndFields().then((res) => {
          //if provision of lists is completed then create lookup
          if (res == "Success") {
            this.createLookupField();
            //Loading historic data into report lists for already completed tournaments while upgrading the app.
            this.dataLoadForReport();

            if (this.state.showError == false) {
              this.setState({ showSuccess: true });
            }
          }
          this.checkUserRole();
        });
      }
    }
    catch (error) {
      console.error("TOT_TOTLandingPage_componentDidMount_FailedToGetUserDetails \n", error);
      this.setState({ showError: true, errorMessage: stringsConstants.TOTErrorMessage + "while getting user details. Below are the details: \n" + JSON.stringify(error), showSuccess: false });
    }
  }

  //Loading data into 'Tournaments Report' and 'Participants Report' lists
  private async dataLoadForReport() {
    try {

      let tournamentsReportListItems = await commonService.getAllListItems(stringsConstants.TournamentsReportList);
      if (tournamentsReportListItems.length == 0) {

        let filterString: string = "Status eq '" + stringsConstants.TournamentStatusCompleted + "'";
        let tournamentsListItems = await commonService.getItemsWithOnlyFilter(stringsConstants.TournamentsMasterList, filterString);

        if (tournamentsListItems.length > 0) {
          for (let counter = 0; counter < tournamentsListItems.length; counter++) {
            await commonService.updateCompletedTournamentDetails(tournamentsListItems[counter].Title);
          }
        }
      }
    }
    catch (error) {
      this.setState({ showError: true, showSuccess: false, errorMessage: stringsConstants.TOTErrorMessage + "while setting up Tournaments Report. Please delete 'Tournaments Report' and 'Participants Report' lists from the site and retry 'Enable Tournament Of Teams' from the home page." });
      console.error("TOT_TOTLandingPage_dataLoadForReport_FailedtoLoadData \n", JSON.stringify(error));
    }

  }
  //Check current users's is admin from "ToT admin List" and set the UI components accordingly
  private async checkUserRole() {
    try {
      let filterQuery: string =
        "Title eq '" +
        this.props.context.pageContext.user.email.toLowerCase() +
        "'";
      const listItem: any = await commonService.getItemsWithOnlyFilter(
        stringsConstants.AdminList,
        filterQuery
      );
      if (listItem.length != 0) {
        this.setState({ isAdmin: true });
      } else {
        this.setState({ isAdmin: false });
      }
      this.setState({
        isShowLoader: false,
      });
    } catch (error) {
      console.error(
        "TOT_TOTLandingPage_checkUserRole_FailedToValidateUserInAdminList \n",
        error
      );
      this.setState({
        showError: true,
        isShowLoader: false,
        errorMessage:
          stringsConstants.TOTErrorMessage +
          "while getting user from TOT Admin list. Below are the details: \n" +
          JSON.stringify(error),
        showSuccess: false,
      });
    }
  }

  //validate if the list column already exists
  private async checkFieldExists(
    spListTitle: string,
    fieldsToCreate: string[]
  ) {
    let totalFieldsToCreate = [];
    try {
      const filterFields = await sp.web.lists
        .getByTitle(spListTitle)
        .fields.filter("Hidden eq false and ReadOnlyField eq false")
        .get();
      for (let i = 0; i < fieldsToCreate.length; i++) {
        // compare fields
        const parser = new DOMParser();
        const xml = parser.parseFromString(fieldsToCreate[i], "text/xml");
        let fieldNameToCheck = xml
          .querySelector("Field")
          .getAttribute("DisplayName");
        let fieldExists = filterFields.filter(
          (e) => e.Title == fieldNameToCheck
        );
        if (fieldExists.length == 0) {
          totalFieldsToCreate.push(fieldsToCreate[i]);
        }
      }
      return totalFieldsToCreate;
    } catch (error) {
      console.error("TOT_TOTLandingPage_checkFieldExists \n", error);
      this.setState({
        showError: true,
        errorMessage:
          stringsConstants.TOTErrorMessage +
          " while validating if field exists. Below are the details: \n" +
          JSON.stringify(error),
        showSuccess: false,
      });
    }
  }

  //add master data to list
  private async createMasterData(
    listname: string,
    masterDataToAdd: any
  ): Promise<any> {
    return new Promise<any>(async (resolve, reject) => {
      try {
        //get list context
        const listContext = await sp.web.lists.getByTitle(listname);
        const listItemCount = (await listContext.get()).ItemCount;
        if (listItemCount == 0) {
          let batchProcess = sp.web.createBatch();
          const entityTypeFullName =
            await listContext.getListItemEntityTypeFullName();
          //update Title display name
          switch (listname) {
            case stringsConstants.AdminList:
              //add master data
              listContext.items
                .inBatch(batchProcess)
                .add(
                  { Title: this.props.context.pageContext.user.email },
                  entityTypeFullName
                );
              await batchProcess.execute();
              break;
            case stringsConstants.ActionsMasterList:
              //create master data
              for (let j = 0; j < masterDataToAdd.length; j++) {
                listContext.items.inBatch(batchProcess).add(
                  {
                    Title: masterDataToAdd[j]["Title"],
                    Category: masterDataToAdd[j]["Category"],
                    Description: masterDataToAdd[j]["Description"],
                    Points: masterDataToAdd[j]["Points"],
                    HelpURL: masterDataToAdd[j]["HelpURL"],
                  },
                  entityTypeFullName
                );
              }
              await batchProcess.execute();
              break;
            case stringsConstants.TournamentsMasterList:
              //add master data
              for (let j = 0; j < masterDataToAdd.length; j++) {
                listContext.items.inBatch(batchProcess).add(
                  {
                    Title: masterDataToAdd[j]["Title"],
                    Description: masterDataToAdd[j]["Description"],
                    Status: masterDataToAdd[j]["Status"],
                  },
                  entityTypeFullName
                );
              }
              await batchProcess.execute();
              break;
            case stringsConstants.TournamentActionsMasterList:
              //add master data
              for (let j = 0; j < masterDataToAdd.length; j++) {
                listContext.items.inBatch(batchProcess).add(
                  {
                    Title: masterDataToAdd[j]["Title"],
                    Category: masterDataToAdd[j]["Category"],
                    Action: masterDataToAdd[j]["Action"],
                    Description: masterDataToAdd[j]["Description"],
                    Points: masterDataToAdd[j]["Points"],
                    HelpURL: masterDataToAdd[j]["HelpURL"],
                  },
                  entityTypeFullName
                );
              }
              await batchProcess.execute();
              break;
            default:
          }
        }
        resolve("Success");
      } catch (error) {
        console.error("TOT_TOTLandingPage_createMasterData \n", error);
        this.setState({
          showError: true,
          errorMessage:
            stringsConstants.TOTErrorMessage +
            " while adding master data to lists. Below are the details: \n" +
            JSON.stringify(error),
          showSuccess: false,
        });
        reject("Failed");
      }
    });
  }

  //Onclick of header Redirect to TOT landing page
  public redirectTotHome() {
    this.setState({
      leaderBoard: false,
      createTournament: false,
      manageTournament: false,
      dashboard: false,
      digitalBadge: false,
    });
  }

  //Create tournament name look up field in Digital badge assets lib
  private async createLookupField() {
    const listStructure: any = siteconfig.libraries;
    //get lookup column        
    await sp.web.lists.getByTitle(stringsConstants.TournamentsMasterList).get()
      .then(async (resp) => {
        if (resp.Title != undefined) {
          let digitalLib = sp.web.lists.getByTitle(
            stringsConstants.DigitalBadgeLibrary
          );
          if (digitalLib != undefined) {
            digitalLib.fields.getByInternalNameOrTitle("Tournament").get()
              .then(() => {
                let imageContext;
                listStructure.forEach(async (element) => {
                  const masterDataDetails: string[] = element["masterData"];
                  for (let k = 0; k < masterDataDetails.length; k++) {
                    //check file exists before adding
                    let fileExists = await sp.web.getFileByServerRelativeUrl("/" + this.state.inclusionpath + "/"
                      + this.state.siteName + "/" + stringsConstants.DigitalBadgeLibrary + "/" + masterDataDetails[k]['Name']).select('Exists').get()
                      .then((d) => d.Exists)
                      .catch(() => false);
                    if (!fileExists) {
                      //unable to resolve the dynamic path from siteconfig/dynamic var, hence the switch case
                      switch (masterDataDetails[k]['Title']) {
                        case "Shortcut Hero":
                          imageContext = fetch(require('../assets/images/Photo_Frame_Shortcuts.png'));
                          break;
                        case "Always on Mute":
                          imageContext = fetch(require('../assets/images/Photo_Frame_Mute.png'));
                          break;
                        case "Virtual Background":
                          imageContext = fetch(require('../assets/images/Photo_Frame_Mess.png'));
                          break;
                        case "Jokester":
                          imageContext = fetch(require('../assets/images/Photo_Frame_Jokes.png'));
                          break;
                        case "Double Booked":
                          imageContext = fetch(require('../assets/images/Photo_Frame_Booked.png'));
                          break;
                      }
                      //upload default badges
                      imageContext.then(res => res.blob()).then((blob) => {
                        sp.web.getFolderByServerRelativeUrl("/" + this.state.inclusionpath + "/"
                          + this.state.siteName + "/" + stringsConstants.DigitalBadgeLibrary).files.add(masterDataDetails[k]['Name'], blob, true)
                          .then((res) => {
                            res.file.getItem().then(item => {
                              item.update({
                                Title: masterDataDetails[k]['Title'],
                                TournamentId: masterDataDetails[k]['TournamentName']
                              });
                            });
                          });
                      });
                    }
                  }//master data loop
                });
              }).catch(async () => {
                //field doesn't exists, hence create it
                await digitalLib.fields.addLookup("Tournament", resp.Id, "Title").then(() => {
                  let imageContext;
                  listStructure.forEach(async (element) => {
                    const masterDataDetails: string[] = element["masterData"];
                    for (let k = 0; k < masterDataDetails.length; k++) {
                      //unable to resolve the dynamic path from siteconfig, hence the switch case
                      switch (masterDataDetails[k]['Title']) {
                        case "Shortcut Hero":
                          imageContext = fetch(require('../assets/images/Photo_Frame_Shortcuts.png'));
                          break;
                        case "Always on Mute":
                          imageContext = fetch(require('../assets/images/Photo_Frame_Mute.png'));
                          break;
                        case "Virtual Background":
                          imageContext = fetch(require('../assets/images/Photo_Frame_Mess.png'));
                          break;
                        case "Jokester":
                          imageContext = fetch(require('../assets/images/Photo_Frame_Jokes.png'));
                          break;
                        case "Double Booked":
                          imageContext = fetch(require('../assets/images/Photo_Frame_Booked.png'));
                          break;
                      }
                      //upload default badges
                      imageContext.then(res => res.blob()).then((blob) => {
                        sp.web.getFolderByServerRelativeUrl("/" + this.state.inclusionpath + "/"
                          + this.state.siteName + "/" + stringsConstants.DigitalBadgeLibrary).files.add(masterDataDetails[k]['Name'], blob, true)
                          .then((res) => {
                            res.file.getItem().then(item => {
                              item.update({
                                Title: masterDataDetails[k]['Title'],
                                TournamentId: masterDataDetails[k]['TournamentName']
                              });
                            });
                          });
                      });
                    }//master data loop
                  });
                });
                await digitalLib.defaultView.fields.add("Tournament");
              });
          }
        }
      })
      .catch((err) => {
        console.error(
          "TOT_TOTLandingPage_createLookField \n",
          JSON.stringify(err)
        );
        this.setState({
          showError: true,
          errorMessage:
            stringsConstants.TOTErrorMessage +
            " while adding lookup field. Below are the details: \n" +
            JSON.stringify(err),
          showSuccess: false,
        });
      });
  }
  //create lists and fileds and upload master data related to TOT
  private async provisionTOTListsAndFields(): Promise<any> {
    return new Promise<any>(async (resolve, reject) => {
      try {
        const listPromise = [];
        //get all lists schema from siteconfig
        const listStructure: any = siteconfig.totLists;

        for (let element = 0; element < listStructure.length; element++) {
          const spListTitle: string = listStructure[element]["listName"];
          const spListTemplate = listStructure[element]["listTemplate"];
          const fieldsToCreate: string[] = listStructure[element]["fields"];
          const masterDataToAdd: string[] = listStructure[element]["masterData"];
          //Ensure list exists, creates if not found and add fields/data if already created
          console.log("TOTLandingPage_Checking if list already exists. ", spListTitle);
          await sp.web.lists.getByTitle(spListTitle).get().then(async (list) => {
            console.log("TOTLandingPage_Checking field exists. ", spListTitle);
            let totalFieldsToCreate = await this.checkFieldExists(spListTitle, fieldsToCreate);
            if (totalFieldsToCreate.length > 0) {
              console.log("TOTLandingPage_Creating list fields. ", spListTitle);
              await commonService.createListFields(list.Title, totalFieldsToCreate).then(async (res) => {
                if (res = "Success") {
                  console.log("TOTLandingPage_Created list fields successfully. ", spListTitle);
                  listPromise.push(true);
                } else {
                  console.log("TOTLandingPage_Failed to create List fields. ", spListTitle);
                  listPromise.push(false);
                }
              }).catch((err) => {
                listPromise.push(false);
                console.error("TOTLandingPage_provisionTOTListsAndFields. \n", err);
              });
            }
            else {
              console.log("TOTLandingPage_No fields to be created. ", spListTitle);
              listPromise.push(true);
            }
          }).catch(async () => {
            await sp.web.lists.add(spListTitle, "", spListTemplate, false).then(async () => {
              console.log("TOTLandingPage_Created list successfully. ", spListTitle);
              //verify field exists
              let totalFieldsToCreate = await this.checkFieldExists(spListTitle, fieldsToCreate);
              await commonService.createListFields(spListTitle, totalFieldsToCreate).
                then(async (res) => {
                  console.log("TOTLandingPage_List fields are created successfully. ", spListTitle);
                  if (res = "Success")
                    //rename title fields and upload master data
                    switch (spListTitle) {
                      case stringsConstants.AdminList:
                        //rename title display name to TOT Admins  
                        await sp.web.lists.getByTitle(spListTitle).fields.getByTitle("Title").update({ Title: "TOT Admins" });
                        break;
                      case stringsConstants.ActionsMasterList:
                        //rename title display name to Action
                        await sp.web.lists.getByTitle(spListTitle).fields.getByTitle("Title").update({ Title: "Action" });
                        break;
                      case stringsConstants.TournamentsMasterList:
                        //rename title display name to Tournament Name 
                        await sp.web.lists.getByTitle(spListTitle).fields.getByTitle("Title").update({ Title: "Tournament Name", Indexed: true, EnforceUniqueValues: true });
                        break;
                      case stringsConstants.TournamentActionsMasterList:
                        //rename title display name to Tournament Name and apply unique
                        await sp.web.lists.getByTitle(spListTitle).fields.getByTitle("Title").update({ Title: "Tournament Name" });
                        break;
                      case stringsConstants.UserActionsList:
                        //rename title display name to User Email
                        await sp.web.lists.getByTitle(spListTitle).fields.getByTitle("Title").update({ Title: "User Email", Indexed: true });
                        break;
                      case stringsConstants.TournamentsReportList:
                        //rename title display name to Tournament Name and apply unique
                        await sp.web.lists.getByTitle(spListTitle).fields.getByTitle("Title").update({ Title: "Tournament Name", Indexed: true });
                        break;
                      case stringsConstants.ParticipantsReportList:
                        //rename title display name to Tournament Name and apply unique
                        await sp.web.lists.getByTitle(spListTitle).fields.getByTitle("Title").update({ Title: "Tournament Name", Indexed: true });
                        break;
                      case stringsConstants.TopParticipantsList:
                        //rename title display name to Tournament Name and apply unique
                        await sp.web.lists.getByTitle(spListTitle).fields.getByTitle("Title").update({ Title: "User Name", Indexed: true });
                        break;
                      default:
                    }
                  let statusOfCreation = await this.createMasterData(spListTitle, masterDataToAdd);
                  let promiseStatus = Promise.all(statusOfCreation);
                  promiseStatus.then(async () => {
                    listPromise.push(true);
                  }).catch((err) => {
                    listPromise.push(false);
                    console.error("TOT_TOTLandingPage_provisionTOTListsAndFields_FailedToAddMasterData \n", err);
                    this.setState({ showError: true, errorMessage: stringsConstants.TOTErrorMessage + " while adding master data. Below are the details: \n" + JSON.stringify(err), showSuccess: false });
                  });
                }).catch((err) => {
                  listPromise.push(false);
                  console.error("TOT_TOTLandingPage_provisionTOTListsAndFields_FailedToCreatedField \n", err);
                  this.setState({ showError: true, errorMessage: stringsConstants.TOTErrorMessage + " while adding list fields. Below are the details: \n" + JSON.stringify(err), showSuccess: false });
                });
            }).catch((err) => {
              listPromise.push(false);
              console.error("TOT_TOTLandingPage_provisionTOTListsAndFields_FailedToAddList\n", err);
              this.setState({ showError: true, errorMessage: stringsConstants.TOTErrorMessage + " while adding list. Below are the details: \n" + JSON.stringify(err), showSuccess: false });
            });
          });
        } //End of For loop
        //Check if all the TOT lists are provisioned without failure and return promise
        Promise.all(listPromise).then(async () => {
          console.log("TOT_TOTLandingPage_Promises returned for all lists ", listPromise);
          if (listPromise.includes(false)) {
            reject("Failed");
          }
          else {
            resolve("Success");
          }
        });
      }
      catch (error) {
        console.error("TOT_TOTLandingPage_provisionTOTListsAndFields \n", error);
        this.setState({ showError: true, errorMessage: stringsConstants.TOTErrorMessage + " while adding list and/or fields. Below are the details: \n" + JSON.stringify(error), showSuccess: false });
        reject("Failed");
      }
    });
  }

  public render(): React.ReactElement<ITOTLandingPageProps> {
    return (
      <div className={styles.totLandingPage}>
        <div className={styles.container}>
          {!this.state.leaderBoard &&
            !this.state.createTournament &&
            !this.state.dashboard &&
            !this.state.digitalBadge &&
            !this.state.manageTournament &&
            !this.state.tournamentReport && (
              <div>
                <div className={styles.totHeader}>
                  <span className={styles.totPageHeading} onClick={this.redirectTotHome}>{LocaleStrings.TOTBreadcrumbLabel}</span>
                </div>
                <div className={styles.grid}>
                  <div className={styles.messageContainer}>
                    {this.state.showSuccess && (
                      <Label className={styles.successMessage}>
                        <img src={require('../assets/TOTImages/tickIcon.png')} alt="tickIcon" className={styles.tickImage} />
                        {LocaleStrings.EnableTOTSuccessMessage}
                      </Label>
                    )}
                    {this.state.showError && (
                      <Label className={styles.errorMessage}>
                        {this.state.errorMessage}
                      </Label>
                    )}
                  </div>
                  {this.state.isShowLoader &&
                    <Spinner
                      label={this.state.spinnerMessage}
                      size={SpinnerSize.large}
                    />
                  }
                  {!this.state.isShowLoader && (
                    <h5 className={styles.pageSubHeader}>{LocaleStrings.QuickLinksLabel}</h5>
                  )}
                  {!this.state.isShowLoader && (
                    <Row className="mt-4">
                      <Col sm={3} className={styles.imageLayout}>
                        <Media
                          className={styles.cursor}
                          onClick={() =>
                            this.setState({
                              leaderBoard: !this.state.leaderBoard,
                              showSuccess: false,
                            })
                          }
                        >
                          <div className={styles.mb}>
                            <img
                              src={require("../assets/TOTImages/LeaderBoard.svg")}
                              alt={LocaleStrings.TOTLeaderBoardPageTitle}
                              title={LocaleStrings.TOTLeaderBoardPageTitle}
                              className={styles.dashboardimgs}
                            />
                            <div className={styles.center} title={LocaleStrings.TOTLeaderBoardPageTitle}>{LocaleStrings.TOTLeaderBoardPageTitle}</div>
                          </div>
                        </Media>
                      </Col>
                      <Col sm={3} className={styles.imageLayout}>
                        <Media
                          className={styles.cursor}
                          onClick={() =>
                            this.setState({
                              dashboard: !this.state.dashboard,
                              showSuccess: false,
                            })
                          }
                        >
                          <div className={styles.mb}>
                            <img
                              src={require("../assets/TOTImages/MyDashboard.svg")}
                              alt={LocaleStrings.TOTMyDashboardPageTitle}
                              title={LocaleStrings.TOTMyDashboardPageTitle}
                              className={styles.dashboardimgs}
                            />
                            <div className={styles.center} title={LocaleStrings.TOTMyDashboardPageTitle}>{LocaleStrings.TOTMyDashboardPageTitle}</div>
                          </div>
                        </Media>
                      </Col>
                      <Col sm={3} className={styles.imageLayout}>
                        <Media
                          className={styles.cursor}
                          onClick={() => this.setState({ digitalBadge: !this.state.digitalBadge })}
                        >
                          <div className={styles.mb}>
                            <img
                              src={require("../assets/CMPImages/DigitalBadge.svg")}
                              alt={LocaleStrings.DigitalMembersToolTip}
                              title={LocaleStrings.DigitalMembersToolTip}
                              className={styles.dashboardimgs}
                            />
                            <div className={styles.center} title={LocaleStrings.DigitalBadgeLabel}>{LocaleStrings.DigitalBadgeLabel}</div>
                          </div>
                        </Media>
                      </Col>
                    </Row>
                  )}

                  {this.state.isAdmin && (
                    <div>
                      <h5 className={styles.pageSubHeader}>{LocaleStrings.AdminToolsLabel}</h5>
                    </div>
                  )}

                  {this.state.isAdmin && (
                    <Row className="mt-4">
                      <Col sm={3} className={styles.imageLayout}>
                        <Media className={styles.cursor}>
                          <div className={styles.mb}>
                            <a
                              href={`/${this.state.inclusionpath}/${this.state.siteName}/Lists/Actions%20List/AllItems.aspx`}
                              target="_blank"
                            >
                              <img
                                src={require("../assets/TOTImages/ManageTournamentActions.svg")}
                                alt={LocaleStrings.ManageTournamentActionsToolTip}
                                title={LocaleStrings.ManageTournamentActionsToolTip}
                                className={`${styles.dashboardimgs}`}
                              />
                            </a>
                            <div className={`${styles.center}`} title={LocaleStrings.ManageTournamentActionsLabel}>
                              {LocaleStrings.ManageTournamentActionsLabel}
                            </div>
                          </div>
                        </Media>
                      </Col>
                      <Col sm={3} className={styles.imageLayout}>
                        <Media
                          className={styles.cursor}
                          onClick={() =>
                            this.setState({
                              createTournament: !this.state.createTournament,
                              showSuccess: false,
                            })
                          }
                        >
                          <div className={styles.mb}>
                            <img
                              src={require("../assets/TOTImages/CreateTournament.svg")}
                              alt={LocaleStrings.CreateTournamentPageTitle}
                              title={LocaleStrings.CreateTournamentPageTitle}
                              className={styles.dashboardimgs}
                            />
                            <div className={styles.center} title={LocaleStrings.CreateTournamentPageTitle}>
                              {LocaleStrings.CreateTournamentPageTitle}
                            </div>
                          </div>
                        </Media>
                      </Col>
                      <Col sm={3} className={styles.imageLayout}>
                        <Media
                          className={styles.cursor}
                          onClick={() =>
                            this.setState({
                              manageTournament: !this.state.manageTournament,
                              showSuccess: false,
                            })
                          }
                        >
                          <div className={styles.mb}>
                            <img
                              src={require("../assets/TOTImages/ManageTournaments.svg")}
                              alt={LocaleStrings.ManageTournamentsLabel}
                              title={LocaleStrings.ManageTournamentsLabel}
                              className={styles.dashboardimgs}
                            />
                            <div className={styles.center} title={LocaleStrings.ManageTournamentsLabel}>{LocaleStrings.ManageTournamentsLabel}</div>
                          </div>
                        </Media>
                      </Col>

                      <Col sm={3} className={styles.imageLayout}>
                        <Media className={styles.cursor}>
                          <div className={styles.mb}>
                            <a
                              href={`/${this.state.inclusionpath}/${this.state.siteName}/Lists/ToT%20Admins/AllItems.aspx`}
                              target="_blank"
                            >
                              <img
                                src={require("../assets/TOTImages/ManageAdmins.svg")}
                                alt={LocaleStrings.ManageAdminsToolTip}
                                title={LocaleStrings.ManageAdminsToolTip}
                                className={styles.dashboardimgs}
                              />
                            </a>
                            <div className={styles.center} title={LocaleStrings.ManageAdminsLabel}>{LocaleStrings.ManageAdminsLabel}</div>
                          </div>
                        </Media>
                      </Col>
                      <Col sm={3} className={styles.imageLayout}>
                        <Media className={styles.cursor}>
                          <div className={styles.mb}>
                            <a
                              href={`/${this.state.inclusionpath}/${this.state.siteName}/Digital%20Badge%20Assets/Forms/AllItems.aspx`}
                              target="_blank"
                            >
                              <img
                                src={require("../assets/TOTImages/ManageDigitalBadges.svg")}
                                alt={LocaleStrings.ManageDigitalBadgesLabel}
                                title={LocaleStrings.ManageDigitalBadgesLabel}
                                className={`${styles.dashboardimgs}`}
                              />
                            </a>
                            <div className={`${styles.center}`} title={LocaleStrings.ManageDigitalBadgesLabel}>
                              {LocaleStrings.ManageDigitalBadgesLabel}
                            </div>
                          </div>
                        </Media>
                      </Col>
                      <Col sm={3} className={styles.imageLayout}>
                        <Media
                          className={styles.cursor}
                          onClick={() =>
                            this.setState({
                              tournamentReport: !this.state.tournamentReport,
                              showSuccess: false,
                            })
                          }
                        >
                          <div className={styles.mb}>
                            <img
                              src={require("../assets/TOTImages/TournamentsReport.svg")}
                              alt={LocaleStrings.TournamentReportsPageTitle}
                              title={LocaleStrings.TournamentReportsPageTitle}
                              className={styles.dashboardimgs}
                            />
                            <div className={styles.center} title={LocaleStrings.TournamentReportsPageTitle}>{LocaleStrings.TournamentReportsPageTitle}</div>
                          </div>
                        </Media>
                      </Col>
                    </Row>
                  )}
                </div>
              </div>
            )
          }
          {
            this.state.leaderBoard && (
              <TOTLeaderBoard
                siteUrl={this.props.siteUrl}
                context={this.props.context}
                onClickCancel={() => {
                  this.setState({ leaderBoard: false });
                }}
                onClickMyDashboardLink={() => {
                  this.setState({ dashboard: true, leaderBoard: false });
                }}
              />
            )
          }
          {
            this.state.dashboard && (
              <TOTMyDashboard
                siteUrl={this.props.siteUrl}
                context={this.props.context}
                onClickCancel={() => {
                  this.setState({ dashboard: false });
                }
                }
              />
            )
          }
          {
            this.state.tournamentReport && (
              <TOTReport
                siteUrl={this.props.siteUrl}
                context={this.props.context}
                onClickCancel={() => {
                  this.setState({ tournamentReport: false });
                }}
              />
            )
          }

          {
            this.state.digitalBadge && (
              <DigitalBadge
                siteUrl={this.props.siteUrl}
                context={this.props.context}
                clientId=""
                description=""
                theme={ThemeStyle.Light}
                fontSize={12}
                clickcallback={() => this.setState({ digitalBadge: false })}
                clickcallchampionview={() =>
                  this.setState({ digitalBadge: false })
                }
              />
            )
          }
          {
            this.state.createTournament && (
              <TOTCreateTournament
                siteUrl={this.props.siteUrl}
                context={this.props.context}
                onClickCancel={() => {
                  this.setState({ createTournament: false });
                }}
              />
            )
          }
          {
            this.state.manageTournament && (
              <TOTEnableTournament
                siteUrl={this.props.siteUrl}
                context={this.props.context}
                onClickCancel={() => {
                  this.setState({ manageTournament: false });
                }}
              />
            )}
        </div>
      </div>
    );
  }
}
export default TOTLandingPage;
